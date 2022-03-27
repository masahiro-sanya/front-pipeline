import * as cdk from '@aws-cdk/core';
import * as codecommit from '@aws-cdk/aws-codecommit';
import * as codebuild from '@aws-cdk/aws-codebuild';
import * as codepipeline from '@aws-cdk/aws-codepipeline';
import * as codePipeline_actions from '@aws-cdk/aws-codepipeline-actions';
import { StringParameter } from '@aws-cdk/aws-ssm';
import { Bucket, IBucket } from '@aws-cdk/aws-s3';


export class AppStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);


    console.log("*****************CI/CDStack START*****************")

    // プロジェクト名をcontextから取得
    const projectName = this.node.tryGetContext('projectName');
    console.log('ProjectName：' + projectName);

    // タグを作成
    const tag: string = projectName;

    // PJ名でリポジトリを作成する
    const repoName = projectName
    const repo = new codecommit.Repository(this, 'pjRepo', {
      repositoryName: repoName,
      description: 'repository'
    });




    ["prd", "stg", "dev"].forEach(stage => {

      // パラメータストアからS3のarnを取得する
      const bucketArn = StringParameter.valueForStringParameter(this, stage + '-' + projectName + '-bucketArn');
      console.log("bucketArn：" + bucketArn);
      const targetBucket = Bucket.fromBucketArn(this, stage + 'BucketByArn', bucketArn);
      console.log("targetBucket：" + targetBucket);

      // プロジェクトを作成
      const project = this.createProject(stage, targetBucket, tag)

      // パイプラインを作成
      const sourceOutput = new codepipeline.Artifact();
      // 対象ブランチ（prd：main, dev：develop）
      let branch;
      if (stage == 'dev') {
        branch = 'develop';
      } else if (stage == 'stg') {
        branch = 'staging';
      } else {
        branch = 'main'
      }

      new codepipeline.Pipeline(this, this.createId('Pipline', stage, tag), {
        pipelineName: this.createName(stage, tag),
        stages: [{
          stageName: 'Source',
          actions: [
            this.createSourceAction(repo, branch, sourceOutput)
          ],
        },
        {
          stageName: 'Build',
          actions: [
            this.createBuildAction(project, sourceOutput)
          ]
        },
        {
          stageName: 'Deploy',
          actions: [
            this.createDeployAction(targetBucket, sourceOutput)
          ]
        }
        ]
      })
    })
    console.log("*****************CI/CDStack END*****************")
  }

  //**************************************************** */
  // idの生成（tag + name + stage)
  //**************************************************** */
  private createId(name: string, stage: string, tag: string): string {
    return tag + '-' + name + '-' + stage;
  }

  //**************************************************** */
  // 名前の生成（stage + tag)
  //**************************************************** */
  private createName(stage: string, tag: string): string {
    return stage + '-' + tag
  }

  //**************************************************** */
  // プロジェクトの生成
  //**************************************************** */
  private createProject(stage: string, s3BucketName: IBucket, tag: string): codebuild.PipelineProject {
    const project = new codebuild.PipelineProject(this, this.createId('Project', stage, tag), {
      projectName: this.createName(stage, tag),
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        // ビルドプロジェクトで実行するコマンドを定義
        phases: {
          build: {
            commands: [
              'echo "*******Start Build*******"',
              // 'npm build',
            ]
          }
        }
      })
    })
    return project
  }

  //**************************************************** */
  // CodePipelineのソースアクション（CodeCommit）の生成
  //**************************************************** */
  private createSourceAction(repo: codecommit.Repository, branch: string, sourceOutput: codepipeline.Artifact): codePipeline_actions.CodeCommitSourceAction {
    return new codePipeline_actions.CodeCommitSourceAction({
      actionName: 'CodeCommit',
      repository: repo,
      branch: branch,
      output: sourceOutput
    });
  }
  //**************************************************** */
  // CodePipelineのビルドアクション（CodeBuild）の生成
  //**************************************************** */
  private createBuildAction(project: codebuild.IProject, sourceOutput: codepipeline.Artifact) {
    return new codePipeline_actions.CodeBuildAction({
      actionName: 'CodeBuild',
      project: project,
      input: sourceOutput,
      outputs: [new codepipeline.Artifact()],
    });
  }

  //**************************************************** */
  // CodePipelineのデプロイアクションの生成
  //**************************************************** */
  private createDeployAction(targetBucket: IBucket, sourceOutput: codepipeline.Artifact) {
    return new codePipeline_actions.S3DeployAction({
      actionName: 'CodeDeploy',
      bucket: targetBucket,
      input: sourceOutput
    });
  }
}