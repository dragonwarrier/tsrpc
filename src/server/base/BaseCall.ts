import { ApiServiceDef, MsgServiceDef, TsrpcError, TsrpcErrorData } from 'tsrpc-proto';
import { PoolItem } from '../../models/Pool';
import { PrefixLogger } from '../models/PrefixLogger';
import { BaseConnection } from './BaseConnection';

export interface ApiCallOptions<Req = any, Res = any> {
    /** Connection */
    conn: BaseConnection,
    logger: PrefixLogger,
    service: ApiServiceDef,

    /** 仅长连接才有，服务器透传 */
    sn?: number,

    /** Request Data */
    req: Req,

    /** 
     * Sended Response Data
     * `undefined` means it have not sendRes yet
     */
    sendedRes?: ApiResponse<Res>,

    /** Time that the server received the req */
    startTime: number,
    /** Time from received req to send res */
    usedTime?: number
}

export interface ApiResponseSucc<Res> {
    isSucc: true,
    res: Res,
    err?: undefined
}
export interface ApiResponseError {
    isSucc: false,
    res?: undefined,
    err: TsrpcError
}
export type ApiResponse<Res> = ApiResponseSucc<Res> | ApiResponseError;

export abstract class ApiCall<Req = any, Res = any, CallOptions extends ApiCallOptions<Req, Res> = ApiCallOptions<Req, Res>> extends PoolItem<CallOptions> {
    readonly type = 'api' as const;

    get conn(): CallOptions['conn'] {
        return this.options.conn;
    }

    get logger() {
        return this.options.logger;
    }

    get service() {
        return this.options.service;
    }

    get sn() {
        return this.options.sn;
    }

    get req() {
        return this.options.req;
    }

    get sendedRes() {
        return this.options.sendedRes;
    }

    get startTime() {
        return this.options.startTime;
    }

    get usedTime() {
        return this.options.usedTime;
    }

    clean() {
        PrefixLogger.pool.put(this.options.logger);
        super.clean();
    }

    succ(res: Res): void {
        this._prepareRes({
            isSucc: true,
            res: res
        })
    }

    error(err: TsrpcError): void;
    error(message: string, info?: Partial<TsrpcErrorData>): void;
    error(errOrMsg: string | TsrpcError, info?: Partial<TsrpcErrorData>): void {
        let error: TsrpcError = typeof errOrMsg === 'string' ? new TsrpcError(errOrMsg, info) : errOrMsg;
        this._prepareRes({
            isSucc: false,
            err: error
        })
    };

    protected _prepareRes(apiRes: ApiResponse<Res>) {
        if (this.sendedRes) {
            this.logger.warn('Send API res (succ) duplicately.')
            return;
        }

        // TODO exec send res flow
        // prevent (maybe)

        // Do Send!
        this.options.sendedRes = apiRes;
        this.options.usedTime = Date.now() - this.startTime;
        this._sendRes(apiRes);
    }

    protected abstract _sendRes(apiRes: ApiResponse<Res>): void;

    // Put into pool
    abstract destroy(): void;
}

export interface MsgCallOptions {
    conn: any,
    logger: PrefixLogger;
    service: MsgServiceDef,
    msg: any
}
export abstract class MsgCall<Msg = any, CallOptions extends MsgCallOptions = MsgCallOptions> extends PoolItem<CallOptions> {
    readonly type = 'msg' as const;

    get conn(): CallOptions['conn'] {
        return this.options.conn;
    }

    get logger() {
        return this.options.logger;
    }

    get service() {
        return this.options.service;
    }

    get msg() {
        return this.options.msg;
    }

    clean() {
        PrefixLogger.pool.put(this.logger);
        super.clean();
    }

    // Put into pool
    abstract destroy(): void;
}

export type BaseCall = ApiCall | MsgCall;