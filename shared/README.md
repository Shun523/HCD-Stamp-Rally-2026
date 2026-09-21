# Shared API contracts

`src/index.ts` に参加者・機体・管理APIのZodスキーマとTypeScript型を置いています。serverとwebはこのパッケージを参照します。

```sh
pnpm --filter @hcd-stamp-rally/shared test
pnpm --filter @hcd-stamp-rally/shared lint
pnpm --filter @hcd-stamp-rally/shared typecheck
```
