import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  aws_s3 as s3,
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as origins,
  aws_iam as iam,
  RemovalPolicy,
  Duration,
  aws_ssm as ssm,
} from "aws-cdk-lib";

export class StaticHostingStack extends cdk.Stack {
  constructor(
    scope: Construct,
    id: string,
    project: string,
    phase: string,
    props?: cdk.StackProps
  ) {
    super(scope, id, props);

    // CORS ルールの作成
    const corsRule: s3.CorsRule = {
      allowedMethods: [s3.HttpMethods.GET],
      allowedOrigins: ["*"],

      allowedHeaders: [
        "Origins",
        "Access-Control-Request-Headers",
        "Access-Control-Request-Method",
      ],
      exposedHeaders: ["exposedHeaders"],
      id: `${project}-${phase}-static-web-hosting-cors-rule`,
      maxAge: 600,
    };

    // S3バケットの作成
    const hostingS3 = new s3.Bucket(
      this,
      `${project}-${phase}-static-web-hosting-bucket`,
      {
        bucketName: `${project}-${phase}-static-web-hosting-bucket`,
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        removalPolicy: RemovalPolicy.DESTROY,
        encryption: s3.BucketEncryption.S3_MANAGED,
        versioned: true,
        cors: [corsRule],
      }
    );

    // OAI作成
    const cloudfrontOai = new cloudfront.OriginAccessIdentity(
      this,
      `${project}-${phase}-cloudfront-oai`
    );

    // バケットポリシー作成
    const bucketPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["s3:GetObject"],
      principals: [
        new iam.CanonicalUserPrincipal(
          cloudfrontOai.cloudFrontOriginAccessIdentityS3CanonicalUserId
        ),
      ],
      resources: [`${hostingS3.bucketArn}/*`],
    });

    hostingS3.addToResourcePolicy(bucketPolicy);

    const responseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(
      this,
      `${project}-${phase}-static-web-hosting-response_headers_policy`,
      {
        corsBehavior: {
          accessControlAllowOrigins: ["*"],
          accessControlAllowHeaders: [
            "Access-Control-Allow-Origin",
            "Authorization",
          ],
          accessControlAllowMethods: ["GET", "OPTIONS"],
          accessControlMaxAge: Duration.seconds(600),
          accessControlAllowCredentials: true,
          originOverride: true,
        },
      }
    );

    const origin = new origins.S3Origin(hostingS3, {
      originId: `${project}-${phase}-static-web-hosting-origin`,
    });

    // CloudFrontディストリビューション作成
    const distribution = new cloudfront.Distribution(
      this,
      `${project}-${phase}-static-web-hosting-distribution`,
      {
        comment: `${project}-${phase}-static-web-hosting-distribution`,
        priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
        defaultBehavior: {
          origin,
          originRequestPolicy: cloudfront.OriginRequestPolicy.CORS_S3_ORIGIN,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          responseHeadersPolicy,
        },
        defaultRootObject: "index.html",
      }
    );

    // SSMパラメータ作成
    new ssm.StringParameter(this, `${project}-${phase}-origin-bucket`, {
      parameterName: `${project}-${phase}-origin-bucket`,
      stringValue: hostingS3.bucketArn,
    });

    new ssm.StringParameter(this, `${project}-${phase}-distribution-id`, {
      parameterName: `${project}-${phase}-distribution-id`,
      stringValue: distribution.distributionId,
    });
  }
}
