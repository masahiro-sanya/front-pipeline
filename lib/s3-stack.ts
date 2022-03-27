import * as cdk from '@aws-cdk/core';
import * as s3 from '@aws-cdk/aws-s3';
import * as iam from '@aws-cdk/aws-iam';
import { StringParameter } from '@aws-cdk/aws-ssm';
import * as cloudfront from '@aws-cdk/aws-cloudfront';


export class s3Stack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        console.log("*****************S3Stack START*****************")

        // プロジェクト名をcontextから取得
        const projectName = this.node.tryGetContext('projectName');
        console.log('ProjectName：' + projectName);

        // ３環境分のS3バケット、CloudFrontを生成
        ["prd", "stg", "dev"].forEach(stage => {
            // バケット名を設定
            const bucketName= stage + '-' + projectName

            // バケットを生成
            const s3Bucket = new s3.Bucket(this, stage + '-pjBucket', {
                bucketName: bucketName,
                blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            });

            // OAIを設定
            const oai = new cloudfront.OriginAccessIdentity(this, bucketName)

            // バケットポリシーを生成
            const bucketPolicy = new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: ["s3:GetObject"],
                principals: [
                    new iam.CanonicalUserPrincipal(
                        oai.cloudFrontOriginAccessIdentityS3CanonicalUserId
                    ),
                ],
                resources: [s3Bucket.bucketArn + "/*"],
            })
            s3Bucket.addToResourcePolicy(bucketPolicy)

            // CloudFrontFunctionsの定義
            if (stage == 'dev') {
              const basicAuthFunction = new cloudfront.Function(
                this,
                stage + '-BasicAuthFunction',
                {
                    functionName: bucketName + '-BasicAuth',
                    code: cloudfront.FunctionCode.fromFile({
                        filePath: "lambda/BasicAuth/dev-auth.js",
                    }),
                }
              );
              this.createCloudFront(stage, s3Bucket, oai, basicAuthFunction)
            } else if(stage == 'stg') {
                const basicAuthFunction = new cloudfront.Function(
                  this,
                  stage + '-BasicAuthFunction',
                  {
                      functionName: bucketName + '-BasicAuth',
                      code: cloudfront.FunctionCode.fromFile({
                          filePath: "lambda/BasicAuth/stg-auth.js",
                      }),
                  }
                );
                this.createCloudFront(stage, s3Bucket, oai, basicAuthFunction)
              } else {
              const basicAuthFunction = new cloudfront.Function(
                this,
                stage + '-BasicAuthFunction',
                {
                    functionName: bucketName + '-BasicAuth',
                    code: cloudfront.FunctionCode.fromFile({
                        filePath: "lambda/BasicAuth/prd-auth.js",
                    }),
                }
              );
              this.createCloudFront(stage, s3Bucket, oai, basicAuthFunction)
            }

          // パラメータストアへS3BucketArnを登録
            new StringParameter(this, stage + '-bucketArn', {
                parameterName: bucketName + '-bucketArn',
                stringValue: s3Bucket.bucketArn,
              });
        })
        console.log("*****************S3Stack END*****************")
    }

    //****************************************************/
    // CLoudFrontディストリビューションの作成
    //****************************************************/
    private createCloudFront(stage: string, s3Bucket: s3.Bucket, oai: cloudfront.OriginAccessIdentity, basicAuthFunction: cloudfront.Function) {
      new cloudfront.CloudFrontWebDistribution(this, stage + '-Distribution', {
        viewerCertificate: {
          aliases: [],
          props: {
            cloudFrontDefaultCertificate: true,
          },
        },
        priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
        originConfigs: [
          {
            s3OriginSource: {
              s3BucketSource: s3Bucket,
              originAccessIdentity: oai,
            },
            behaviors: [
              {
                isDefaultBehavior: true,
                functionAssociations: [
                    {
                        eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
                        function: basicAuthFunction
                    },
                ],
                minTtl: cdk.Duration.seconds(0),
                maxTtl: cdk.Duration.days(365),
                defaultTtl: cdk.Duration.days(1),
                pathPattern: "*",
              },
            ],
          },
        ],
        errorConfigurations: [
          {
            errorCode: 403,
            responsePagePath: "/error_403.html",
            responseCode: 200,
            errorCachingMinTtl: 0,
          },
          {
            errorCode: 404,
            responsePagePath: "/error_404.html",
            responseCode: 200,
            errorCachingMinTtl: 0,
          },
    ],
  });
    }
}