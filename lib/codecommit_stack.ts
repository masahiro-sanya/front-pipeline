import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { aws_codecommit as codecommit } from "aws-cdk-lib";

export class CodeCommitStack extends cdk.Stack {
  constructor(
    scope: Construct,
    id: string,
    project: string,
    phase: string,
    repoName: string,
    props?: cdk.StackProps
  ) {
    super(scope, id, props);

    // リポジトリ 作成
    new codecommit.Repository(this, `${project}-${phase}-${repoName}-front`, {
      repositoryName: `${project}-${phase}-${repoName}-front`,
      description: `${project}-${phase}-${repoName}-front`,
    });
  }
}
