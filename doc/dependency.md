```mermaid
graph TD
  App[app]

  subgraph Client[client]
    CComp[components]
    CAct[actions]
    CSvc[services]
    CRepo[repositorys]
  end

  subgraph Server[server]
    SSvc[service]
    SRepo[repository]
  end

  %% 許可される導線（明示ルール）
  App --> CComp
  CComp --> CAct
  CAct --> CSvc
  CSvc --> CRepo
```