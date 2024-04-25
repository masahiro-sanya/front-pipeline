import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  aws_codecommit as codecommit,
  aws_codepipeline as codepipeline,
  aws_codepipeline_actions as codepipelineActions,
  aws_codebuild as codebuild,
  aws_iam as iam,
  aws_s3 as s3,
  aws_kms as kms,
  aws_ssm as ssm,
  RemovalPolicy,
} from "aws-cdk-lib";

export class FePipelineDevStack extends cdk.Stack {
  constructor(
    scope: Construct,
    constructId: string,
    project: string,
    phase: string,
    repoName: string,
    props?: cdk.StackProps
  ) {
    super(scope, constructId, props);
    const repository = codecommit.Repository.fromRepositoryArn(
      this,
      `${project}-${phase}-${repoName}-front`,
      `arn:aws:codecommit:${this.region}:${this.account}:${project}-${phase}-${repoName}-front`
    );

    // デプロイ先 BucketArn 取得
    const bucketArn = ssm.StringParameter.valueForStringParameter(
      this,
      `${project}-${phase}-origin-bucket`
    );

    // Bucket コンストラクタ生成
    const targetBucket = s3.Bucket.fromBucketArn(
      this,
      `${project}-${phase}-target-bucket`,
      bucketArn
    );

    // DistributionID 取得
    const distributionId = ssm.StringParameter.valueForStringParameter(
      this,
      `${project}-${phase}-distribution-id`
    );

    // kms key
    const encryptionKey = new kms.Key(this, `${project}-${phase}-kms-front`, {
      alias: `${project}-${phase}-kms-front`,
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // artifact store
    const deployArtifact = new s3.Bucket(
      this,
      `${project}-${phase}-deploy-artifact-front`,
      {
        bucketName: `${project}-${phase}-deploy-artifact-front`,
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        encryption: s3.BucketEncryption.KMS,
        encryptionKey: encryptionKey,
        versioned: true,
      }
    );

    // Service Role
    const eventsServiceRole = new iam.Role(
      this,
      `${project}-${phase}-events-service-role-front`,
      {
        roleName: `${project}-${phase}-events-service-role-front`,
        assumedBy: new iam.ServicePrincipal("events.amazonaws.com"),
      }
    );

    const pipelineServiceRole = new iam.Role(
      this,
      `${project}-${phase}-codepipeline-service-role-front`,
      {
        roleName: `${project}-${phase}-codepipeline-service-role-front`,
        assumedBy: new iam.ServicePrincipal("codepipeline.amazonaws.com"),
      }
    );

    const pipelineServiceRolePolicy = new iam.Policy(
      this,
      `${project}-${phase}-codepipeline-service-role-policy-front`,
      {
        policyName: `${project}-${phase}-codepipeline-service-role-policy-front`,
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["sts:AssumeRole"],
            resources: [`arn:aws:iam::${this.account}:role/*`],
          }),
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
              "s3:PutObject",
              "s3:GetObject",
              "s3:GetObjectVersion",
              "s3:GetBucketVersioning",
              "codebuild:BatchGetBuilds",
              "codebuild:StartBuild",
            ],
            resources: ["*"],
          }),
        ],
      }
    );
    pipelineServiceRole.attachInlinePolicy(pipelineServiceRolePolicy);

    const buildServiceRole = new iam.Role(
      this,
      `${project}-${phase}-codebuild-buildstage-role-front`,
      {
        roleName: `${project}-${phase}-codebuild-buildstage-role-front`,
        assumedBy: new iam.ServicePrincipal("codebuild.amazonaws.com"),
      }
    );

    const buildServiceRolePolicy = new iam.Policy(
      this,
      `${project}-${phase}-codebuild-buildstage-role-policy-front`,
      {
        policyName: `${project}-${phase}-codebuild-buildstage-role-policy-front`,
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["s3:*"],
            resources: [
              `arn:aws:s3:::${targetBucket.bucketName}`,
              `arn:aws:s3:::${targetBucket.bucketName}/*`,
              `arn:aws:s3:::${deployArtifact.bucketName}`,
              `arn:aws:s3:::${deployArtifact.bucketName}/*`,
            ],
          }),
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["cloudfront:CreateInvalidation"],
            resources: [
              `arn:aws:cloudfront::${this.account}:distribution/${distributionId}`,
            ],
          }),
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["dynamodb:*"],
            resources: ["*"],
          }),
        ],
      }
    );
    buildServiceRole.attachInlinePolicy(buildServiceRolePolicy);

    // deploy pipeline
    const deployPipeline = new codepipeline.Pipeline(
      this,
      `${project}-${phase}-pipeline-front`,
      {
        pipelineName: `${project}-${phase}-pipeline-front`,
        artifactBucket: deployArtifact,
        crossAccountKeys: true,
        role: pipelineServiceRole,
      }
    );

    const sourceOutput = new codepipeline.Artifact("source_output");
    const buildOutput = new codepipeline.Artifact("build_output");
    const cleanOutput = new codepipeline.Artifact("clean_output");

    // Source stage
    const sourceStage = deployPipeline.addStage({ stageName: "Source" });
    sourceStage.addAction(
      new codepipelineActions.CodeCommitSourceAction({
        actionName: "Source",
        output: sourceOutput,
        repository: repository,
        branch: "develop",
        trigger: codepipelineActions.CodeCommitTrigger.EVENTS,
        eventRole: eventsServiceRole,
      })
    );

    // Build stage
    const buildProject = new codebuild.PipelineProject(this, "Build", {
      projectName: `${project}-${phase}-build-front`,
      buildSpec: codebuild.BuildSpec.fromSourceFilename(
        `build/${phase}_buildspec_build.yml`
      ),
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
        privileged: true,
        environmentVariables: {
          CLOUDFRONT_DISTRIBUTION_ID: { value: distributionId },
          S3_BUCKET_NAME: { value: targetBucket.bucketName },
        },
      },
      role: buildServiceRole,
    });

    const buildAction = new codepipelineActions.CodeBuildAction({
      actionName: "Build",
      project: buildProject,
      input: sourceOutput,
      outputs: [buildOutput],
    });

    deployPipeline.addStage({
      stageName: "Build",
      actions: [buildAction],
    });

    // Approve stage
    const approveAction = new codepipelineActions.ManualApprovalAction({
      actionName: "Approval",
    });

    deployPipeline.addStage({
      stageName: "Approve",
      actions: [approveAction],
    });

    // Clean stage
    const cleanStage = new codebuild.PipelineProject(this, "Clean", {
      projectName: `${project}-${phase}-clean-front`,
      buildSpec: codebuild.BuildSpec.fromSourceFilename(
        `build/${phase}_buildspec_clean.yml`
      ),
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
        privileged: true,
        environmentVariables: {
          CLOUDFRONT_DISTRIBUTION_ID: { value: distributionId },
          S3_BUCKET_NAME: { value: targetBucket.bucketName },
        },
      },
      role: buildServiceRole,
    });

    const cleanAction = new codepipelineActions.CodeBuildAction({
      actionName: "Clean",
      project: cleanStage,
      input: sourceOutput,
      outputs: [cleanOutput],
    });

    deployPipeline.addStage({
      stageName: "Clean",
      actions: [cleanAction],
    });

    // Deploy stage
    const deployStage = new codepipelineActions.S3DeployAction({
      actionName: "S3Deploy",
      bucket: targetBucket,
      input: buildOutput,
    });

    deployPipeline.addStage({
      stageName: "Deploy",
      actions: [deployStage],
    });
  }
}
