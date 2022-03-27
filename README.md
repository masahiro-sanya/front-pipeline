# CI/CD Stack

## s3-stack.ts

S3 バケットを構築するためのテンプレートです。  
このスタックで作成されるものは下記となります。

- S3 バケット
- バケットポリシー
- CloudFront
- OAI
- CloudFrontFunction

## CloudFrontFunction

本テンプレートで配置された CloudFront にはベーシック認証が適用されます。  
認証用の関数は`/lambda/BasicAuth`配下に配置されている`index.js`にて定義されます。

## template.ts

CI/CD を構築するためのテンプレートです。
このスタックで作成されるものは下記となります。

- CodeCommit リポジトリ
- CodeBuld プロジェクト
- CodePipline

## パラメータストアの利用

本テンプレートでは先に作成した S3 バケットの Arn をパラメータストアを介して、 CI/CD のスタックへ渡しています。
下記に各パラメータ名に対応する値を記します。

| パラメータ名 |          パラメータの値           |
| :----------: | :-------------------------------: |
| prdbucketArn | 本番環境（prd）の S3 バケット Arn |
| stgbucketArn | 検証環境（stg）の S3 バケット Arn |
| devbucketArn | 開発環境（dev）の S3 バケット Arn |

## 実行コマンド

- `npm run build` TypeScript を JavaScript へビルド
- `cdk deploy` デフォルトの AWS 環境へスタックをデプロイ
- `npm run deploy:s3 {S3_StackName} {PJ_Name} {PROFILE}` TS からビルドした S3 スタックを profile で指定した AWS 環境へデプロイ（ビルドは全てのテンプレートに対して実行）
- `npm run deploy:ci/cd {CI/CD_StackName} {PJ_Name} {PROFILE}` TS からビルドした CI/CD スタックを profile で指定した AWS 環境へデプロイ（ビルドは全てのテンプレートに対して実行）
- `npm run deploy:all {PJ_Name} {PROFILE} {S3_StackName} {CI/CD_StackName}` TS からビルドしたスタックを profile で指定した AWS 環境へデプロイ

#### `{PJ_Name}`を指定しない場合、デフォルトで`「projectName」`という PJ 名が入ります。

## リポジトリのクローン

上記、スタック作成完了後、ローカルの git の設定ファイルを変更し、デフォルトブランチを mater から main へ変更して下さい。
（デフォルトブランチが main になっていないと、Pipeline が実行されません）

`git config --global init.defaultBranch main`

## リポジトリ作成後

CodeCommit に下記の名前でブランチを作成することで、それぞれの環境を作成することができます。

| ブランチ名 |      環境       |
| :--------: | :-------------: |
|    main    | 本番環境（prd） |
|  staging   | 検証環境（stg） |
|  develop   | 開発環境（dev） |

各ブランチソースの変更を Push した段階で`template-stack.ts`の`createProject`で定義したビルドプロジェクトが実行され、対応する各環境の S3 バケットへデプロイされます。

## 同じ AWS アカウント内に複数の環境を作成する場合

`template > bin > template.ts`を修正  
下記の Stack を new している箇所に新たに作成したい stack 名を追加する

```
const app = new cdk.App();
new s3Stack(app, 'App-s3Stack');
new AppStack(app, 'App-cicdStack');
                ・
                ・
                ・
```

deploy コマンド時に追加した Stack 名を指定
