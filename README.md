# ndnts-aux-yjs-doc
A server listening on Yjs document changes described in json

Requirements
----
nodejs, pnpm and deno

Instructions
----

```
pnpm login --scope=@ucla-irl --auth-type=legacy --registry=https://npm.pkg.github.com
pnpm install
deno task main --port YOUR_PORT (default 6666)
```