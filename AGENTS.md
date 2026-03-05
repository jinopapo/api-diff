#　アプリ概要
2つの環境で動作するapiのデグレチェックをするツールです

# ディレクトリ構成
## app
- アプリのエントリーポイントです
- server配下、client配下を呼ぶだけの薄いレイヤーです

## app/api
- clientから呼び出されるapiの実装が入ります
- server配下を呼ぶだけの薄いレイヤーです

## server
- サーバー側の実装が入ります

### server/service
- サーバー側のビジネスロジックが入ります

### server/repository
- サーバー側のデータアクセスの実装が入ります

## client
- クライアント側の実装が入ります

### client/components
- クライアント側のページ構成するuiのコンポーネントが入ります
- parts配下の純粋な見た目のコンポーネントを組み合わせて、ロジックを持ったコンポーネントを実装します
- 配下は2階層で1階層目はページ名、2階層目はコンポーネント名毎に分けます
- 例）client/components/agent/AgentList, client/components/compare/CompareResultなど

### client/parts
- client/componentsの中でさらに細かいパーツに分けたいものを入れます
- ロジックを持ってはならず純粋な見た目のみのreactコンポーネントを入れることを想定しています
- 配下は自由に構成してもらって大丈夫です

### client/actions
- componentsの振る舞いの実装が入ります
- 配下は2階層で1階層目はページ名、2階層目はコンポーネント名毎に分けます
    - 例）client/actions/agent/AgentList, client/actions/compare/CompareResultなど
- 配下の構造はclient/componentsの構造と一致します

### client/services
- uiとサーバー側のデータの橋渡しをする実装が入ります
- 配下は1階層でドメイン毎に分けます
    - 例）client/services/agent, client/services/compareなど

### client/repositorys
- クライアント側のデータアクセスの実装が入ります
- 配下は1階層でapi毎に分けます
  - 例）client/repositorys/openai, client/repositorys/llmなど

### client/store/app
- クライアント全体で共有する状態管理の実装が入ります
- 直下にappStore.tsを置き、全体で共有する状態管理の実装を入れます

### client/store/pages
- 各ページごとに状態管理の実装が入ります
- 配下は1階層でページ毎に分けます
  - 例）client/store/pages/agentなど
  - app配下のページ名と一致します

# コーディングルール
./eslint.config.mjsを参照