import http from "http";
import https from "https";
import { EncodeOutput } from "tsbuffer";
import { ApiReturn, BaseServiceType, ServiceProto, TsrpcError, TsrpcErrorType } from "tsrpc-proto";
import { ApiService, MsgService } from "../../models/ServiceMapUtil";
import { TransportDataUtil } from "../../models/TransportDataUtil";
import { BaseClient, BaseClientOptions, defaultBaseClientOptions, PendingApiItem } from "../models/BaseClient";
import { TransportOptions } from "../models/TransportOptions";

export class HttpClient<ServiceType extends BaseServiceType> extends BaseClient<ServiceType> {

    readonly type = 'SHORT';

    private _http: typeof http | typeof https;

    readonly options!: HttpClientOptions;
    constructor(proto: ServiceProto<ServiceType>, options?: Partial<HttpClientOptions>) {
        super(proto, {
            ...defaultHttpClientOptions,
            ...options
        });
        this._http = this.options.server.startsWith('https://') ? https : http;
        this.logger?.log('TSRPC HTTP Client :', this.options.server);
    }

    lastReceivedBuf?: Uint8Array;

    protected _encodeApiReq(service: ApiService, req: any, pendingItem: PendingApiItem): EncodeOutput {
        if (this.options.json) {
            if (this.options.jsonPrune) {
                let opPrune = this.tsbuffer.prune(req, pendingItem.service.reqSchemaId);
                if (!opPrune.isSucc) {
                    return opPrune;
                }
                req = opPrune.pruneOutput;
            }
            return {
                isSucc: true,
                buf: JSON.stringify(req) as any
            }
        }
        else {
            return TransportDataUtil.encodeApiReq(this.tsbuffer, service, req, undefined);
        }
    }

    protected _encodeClientMsg(service: MsgService, msg: any): EncodeOutput {
        if (this.options.json) {
            if (this.options.jsonPrune) {
                let opPrune = this.tsbuffer.prune(msg, service.msgSchemaId);
                if (!opPrune.isSucc) {
                    return opPrune;
                }
                msg = opPrune.pruneOutput;
            }
            return {
                isSucc: true,
                buf: JSON.stringify(msg) as any
            }
        }
        else {
            return TransportDataUtil.encodeClientMsg(this.tsbuffer, service, msg);
        }
    }

    protected async _sendBuf(buf: Uint8Array, options: TransportOptions, serviceId: number, pendingApiItem?: PendingApiItem): Promise<{ err?: TsrpcError | undefined; }> {
        let sn = pendingApiItem?.sn;
        let promise = new Promise<{ err?: TsrpcError | undefined; }>(async rs => {
            // Pre Flow
            if (!this.options.json) {
                let pre = await this.flows.preSendBufferFlow.exec({ buf: buf, sn: pendingApiItem?.sn }, this.logger);
                if (!pre) {
                    return;
                }
                buf = pre.buf;
            }

            // Do Send
            this.options.debugBuf && this.logger?.debug('[SendBuf]' + (sn ? (' #' + sn) : ''), `length=${buf.length}`, buf);

            let httpReq: http.ClientRequest;
            httpReq = this._http.request(
                this.options.json ? (this.options.server + (this.options.server.endsWith('/') ? '' : '/') + this.serviceMap.id2Service[serviceId].name) : this.options.server,
                {
                    method: 'POST',
                    agent: this.options.agent,
                    timeout: options.timeout ?? this.options.timeout,
                    ...(this.options.json ? {
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    } : undefined)
                },
                pendingApiItem ? httpRes => {
                    let data: Buffer[] = [];
                    httpRes.on('data', (v: Buffer) => {
                        data.push(v)
                    });
                    httpRes.on('end', () => {
                        let buf: Uint8Array = Buffer.concat(data)
                        this.lastReceivedBuf = buf;

                        this.options.debugBuf && this.logger?.debug('[RecvBuf]' + (sn ? (' #' + sn) : ''), 'length=' + buf.length, buf);
                        if (this.options.json && pendingApiItem) {
                            let pendingItem = this._pendingApis.find(v => v.sn === sn);
                            let retStr = buf.toString();
                            let ret: ApiReturn<any>;
                            try {
                                ret = JSON.parse(retStr);
                            }
                            catch (e) {
                                ret = {
                                    isSucc: false,
                                    err: {
                                        message: retStr,
                                        type: TsrpcErrorType.ServerError
                                    }
                                }
                            }
                            if (ret.isSucc) {
                                if (this.options.jsonPrune) {
                                    let opPrune = this.tsbuffer.prune(ret.res, pendingApiItem.service.resSchemaId);
                                    if (!opPrune.isSucc) {
                                        pendingItem?.onReturn?.({
                                            isSucc: false,
                                            err: new TsrpcError('Invalid Server Output', {
                                                type: TsrpcErrorType.ClientError,
                                                innerErr: opPrune.errMsg
                                            })
                                        });
                                        return;
                                    }
                                    ret.res = opPrune.pruneOutput;
                                }
                            }
                            else {
                                ret.err = new TsrpcError(ret.err);
                            }
                            pendingItem?.onReturn?.(ret);
                            return;
                        }

                        this._onRecvBuf(buf, serviceId, sn)
                    })
                } : undefined
            );

            httpReq.on('error', e => {
                if (pendingApiItem?.isAborted) {
                    return;
                }

                this.logger?.error('HTTP Req Error:', e);
                rs({
                    err: new TsrpcError(e.message, {
                        type: TsrpcErrorType.NetworkError,
                        code: (e as any).code
                    })
                });
            });

            if (this.options.json) {
                httpReq.write(buf);
            }
            else {
                httpReq.write(Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength));
            }
            httpReq.end(() => {
                rs({});
            });

            if (pendingApiItem) {
                pendingApiItem.onAbort = () => {
                    httpReq.abort();
                }
            }
        });

        promise.finally(() => {
            if (pendingApiItem) {
                pendingApiItem.onAbort = undefined;
            }
        })

        return promise;
    }

}

const defaultHttpClientOptions: HttpClientOptions = {
    ...defaultBaseClientOptions,
    server: 'http://localhost:3000',
    json: false,
    jsonPrune: true
}

export interface HttpClientOptions extends BaseClientOptions {
    /** Server URL */
    server: string;
    /** NodeJS HTTP Agent */
    agent?: http.Agent | https.Agent;
    /** 
     * Use JSON instead of Buffer
     * @defaultValue false
     */
    json: boolean;
    /**
     * 是否剔除协议中未定义的多余字段
     * 默认为 `true`
     */
    jsonPrune: boolean;
}