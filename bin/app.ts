#!/usr/bin/env node
import "source-map-support/register";
import { App } from "aws-cdk-lib";
import { StaticHostingStack } from "../lib/static_hosting_stack";
import { CodeCommitStack } from "../lib/codecommit_stack";
import { FePipelineDevStack } from "../lib/fe_pipeline_stack";

// Appオブジェクトの作成
const app = new App();

// cdk.jsonからパラメータを取得
const project = app.node.tryGetContext("project");
const phase = app.node.tryGetContext("attrphase");
const phaseList = app.node.tryGetContext("phaselist");
const target = app.node.tryGetContext("target");
const targetList = app.node.tryGetContext("targetlist");
const devAccount = app.node.tryGetContext("dev")["accountId"];
const stgAccount = app.node.tryGetContext("stg")["accountId"];
const prdAccount = app.node.tryGetContext("prd")["accountId"];
const devRegion = app.node.tryGetContext("dev")["region"];
const stgRegion = app.node.tryGetContext("stg")["region"];
const prdRegion = app.node.tryGetContext("prd")["region"];
const createDevCodecommit = app.node.tryGetContext("createDevCodecommit");
const createStgCodecommit = app.node.tryGetContext("createStgCodecommit");
const devRepoArn = app.node.tryGetContext("dev")["repoArn"];
const stgRepoArn = app.node.tryGetContext("stg")["repoArn"];
const devRepoName = app.node.tryGetContext("dev")["repoName"];
const stgRepoName = app.node.tryGetContext("stg")["repoName"];

// デプロイ時に phase がない場合エラー
if (!phase) {
  console.log(
    `augument error: please specify [-c attrphase=phaselist] at runtime. in phaseList= [${phaseList}]`
  );
  process.exit(1);
}
// デプロイ時に不正な phase を指定した場合エラー
if (phaseList.indexOf(phase) === -1) {
  console.log(`validation error: specify [attrphase] from [${phaseList}]`);
  process.exit(1);
}
// デプロイ時に target がない場合エラー
if (!target) {
  console.log(
    `augument error: please specify [-c target=targetlist] at runtime. in targetlist= [${targetList}]`
  );
  process.exit(1);
}
// デプロイ時に不正な target を指定した場合エラー
if (targetList.indexOf(target) === -1) {
  console.log(`validation error: specify [target] from [${targetList}]`);
  process.exit(1);
}

// DEV環境
const dev = { region: devRegion, account: devAccount };

// STG環境
const stg = { region: stgRegion, account: stgAccount };

// PRD環境
const prd = { region: prdRegion, account: prdAccount };

if (target === "cicd-fe") {
  const staticHostingStack = new StaticHostingStack(
    app,
    "TsStaticHostingStack",
    project,
    phase,
    { env: dev }
  );
  const codeCommitStack = new CodeCommitStack(
    app,
    "TsCodeCommitStack",
    project,
    phase,
    devRepoName,
    { env: dev }
  );

  if (phase === "dev" && createDevCodecommit) {
    // create Codepipeline
    const frontPipelineStack = new FePipelineDevStack(
      app,
      "TsFePipelineDevStack",
      project,
      phase,
      devRepoName,
      { env: dev }
    );
  }
}
