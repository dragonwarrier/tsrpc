<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [tsrpc](./tsrpc.md) &gt; [HttpServer](./tsrpc.httpserver.md) &gt; [\_makeCall](./tsrpc.httpserver._makecall.md)

## HttpServer.\_makeCall() method

<b>Signature:</b>

```typescript
protected _makeCall(conn: HttpConnection<ServiceType>, input: ParsedServerInput): ApiCallHttp | MsgCallHttp;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  conn | [HttpConnection](./tsrpc.httpconnection.md)<!-- -->&lt;ServiceType&gt; |  |
|  input | ParsedServerInput |  |

<b>Returns:</b>

[ApiCallHttp](./tsrpc.apicallhttp.md) \| [MsgCallHttp](./tsrpc.msgcallhttp.md)
