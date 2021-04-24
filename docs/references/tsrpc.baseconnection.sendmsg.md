<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [tsrpc](./tsrpc.md) &gt; [BaseConnection](./tsrpc.baseconnection.md) &gt; [sendMsg](./tsrpc.baseconnection.sendmsg.md)

## BaseConnection.sendMsg() method

<b>Signature:</b>

```typescript
sendMsg<T extends keyof ServiceType['msg']>(msgName: T, msg: ServiceType['msg'][T]): Promise<{
        isSucc: true;
    } | {
        isSucc: false;
        errMsg: string;
    }>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  msgName | T |  |
|  msg | ServiceType\['msg'\]\[T\] |  |

<b>Returns:</b>

Promise&lt;{ isSucc: true; } \| { isSucc: false; errMsg: string; }&gt;
