import { BaseClient, BaseClientOptions, defaultBaseClientOptions, PendingApiItem, TransportOptions } from "tsrpc-base-client";
import { BaseServiceType, ServiceProto, TsrpcError, TsrpcErrorType } from "tsrpc-proto";
import WebSocket from 'ws';

/**
 * Client for TSRPC WebSocket Server.
 * @typeParam ServiceType - `ServiceType` from generated `proto.ts`
 */
export class WsClient<ServiceType extends BaseServiceType> extends BaseClient<ServiceType, WsClientEventData> {

    readonly type = 'LONG';

    readonly options!: WsClientOptions;
    constructor(proto: ServiceProto<ServiceType>, options?: Partial<WsClientOptions>) {
        super(proto, {
            ...defaultWsClientOptions,
            ...options
        });
        this.logger?.log('TSRPC WebSocket Client :', this.options.server);
    }

    protected async _sendBuf(buf: Uint8Array, options: TransportOptions, serviceId: number, pendingApiItem?: PendingApiItem): Promise<{ err?: TsrpcError; }> {
        return new Promise<{ err?: TsrpcError | undefined; }>(async rs => {
            // Pre Flow
            let pre = await this.flows.preSendBufferFlow.exec({ buf: buf, sn: pendingApiItem?.sn }, this.logger);
            if (!pre) {
                return;
            }
            buf = pre.buf;

            if (!this._ws) {
                rs({
                    err: new TsrpcError('WebSocket is not connected', {
                        code: 'WS_NOT_OPEN',
                        type: TsrpcErrorType.ClientError
                    })
                });
                return;
            }

            // Do Send
            let buffer = Buffer.from(buf);
            this.options.debugBuf && this.logger?.debug('[SendBuf]' + (pendingApiItem ? (' #' + pendingApiItem.sn) : ''), `length=${buffer.byteLength}`, buffer);
            this._ws.send(buffer, err => {
                if (err) {
                    this.logger?.error('WebSocket Send Error:', err);
                    rs({
                        err: new TsrpcError('Network Error', {
                            code: 'SEND_BUF_ERR',
                            type: TsrpcErrorType.NetworkError,
                            innerErr: err
                        })
                    });
                    return;
                }
                rs({});
            });
        });
    }

    get status(): WsClientStatus {
        if (this._promiseConnect) {
            return WsClientStatus.Opening
        }
        else if (this._ws) {
            if (this._ws.readyState === WebSocket.OPEN) {
                return WsClientStatus.Opened;
            }
            else if (this._ws.readyState === WebSocket.CLOSING) {
                return WsClientStatus.Closing;
            }
        }

        return WsClientStatus.Closed;
    }

    private _ws?: WebSocket;

    private _promiseConnect?: Promise<{ isSucc: true } | { isSucc: false, errMsg: string }>;
    /**
     * Connect WebSocket.
     * @returns The `Promise` would never reject, judge connecting result by `isSucc`.
     */
    async connect(): Promise<{ isSucc: true } | { isSucc: false, errMsg: string }> {
        // 已连接中
        if (this._promiseConnect) {
            return this._promiseConnect;
        }

        // 已连接成功
        if (this._ws) {
            return { isSucc: true };
        }

        let ws = new WebSocket(this.options.server);
        this.logger?.log(`Start connecting ${this.options.server}...`)
        this._promiseConnect = new Promise<{ isSucc: true } | { isSucc: false, errMsg: string }>(rs => {
            ws.onopen = () => {
                this._promiseConnect = undefined;
                ws.onopen = undefined as any;
                this._ws = ws;
                this.logger?.log('Connected succ');
                rs({ isSucc: true });
                this.emit('StatusChange', { newStatus: WsClientStatus.Opened });
            };

            ws.onerror = e => {
                this.logger?.error('[WebSocket Error]', e.message);
                // 还在连接中，则连接失败
                if (this._promiseConnect) {
                    this._promiseConnect = undefined;
                    rs({
                        isSucc: false,
                        errMsg: e.message
                    });
                }
            }

            ws.onclose = e => {
                // 清空WebSocket Listener
                ws.onopen = ws.onclose = ws.onmessage = ws.onerror = undefined as any;
                this._ws = undefined;

                let isFromConnecting = !!this._promiseConnect;
                if (this._promiseConnect) {
                    this._promiseConnect = undefined;
                    rs({
                        isSucc: false,
                        errMsg: e.reason ? `Error: ${e.reason}` : 'Network Error'
                    });
                }

                this.emit('StatusChange', { newStatus: WsClientStatus.Closed });

                if (this._rsDisconnecting) {
                    this._rsDisconnecting();
                    this._rsDisconnecting = undefined;
                    this.logger?.log('Disconnected succ', `code=${e.code} reason=${e.reason}`);
                }
                // 已连接上 非主动关闭 触发掉线
                else if (!isFromConnecting) {
                    this.logger?.log(`Lost connection to ${this.options.server}`, `code=${e.code} reason=${e.reason}`);
                    this.emit('LostConnection', undefined);
                }
            };
        })

        ws.onmessage = e => {
            if (e.data instanceof Buffer) {
                this._onRecvBuf(e.data)
            }
            else if (e.data instanceof ArrayBuffer) {
                this._onRecvBuf(new Uint8Array(e.data));
            }
            else {
                this.logger?.log('[Unresolved Recv]', e.data)
            }
        }

        this.emit('StatusChange', { newStatus: WsClientStatus.Opening });
        return this._promiseConnect;
    }

    private _rsDisconnecting?: () => void;
    /** Disconnect WebSocket immediately */
    async disconnect() {
        // 连接不存在
        if (!this._ws) {
            return;
        }

        this.logger?.log('Disconnecting...');
        this.emit('StatusChange', { newStatus: WsClientStatus.Closing });
        return new Promise<void>(rs => {
            this._rsDisconnecting = rs;
            this._ws!.close();
        })
    }
}

const defaultWsClientOptions: WsClientOptions = {
    ...defaultBaseClientOptions,
    server: 'ws://localhost:3000'
}

export interface WsClientOptions extends BaseClientOptions {
    /** Server URL */
    server: string;
}

export enum WsClientStatus {
    Opening = 'OPENING',
    Opened = 'OPENED',
    Closing = 'CLOSING',
    Closed = 'CLOSED'
}

export interface WsClientEventData {
    /** When connection status changed */
    StatusChange: {
        newStatus: WsClientStatus
    },

    /** When connection comes to closed from opened (not manually) */
    LostConnection: undefined
}