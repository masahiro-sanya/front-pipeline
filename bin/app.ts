#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { AppStack } from '../lib/app-stack';
import {s3Stack} from '../lib/s3-stack';

const app = new cdk.App();
new s3Stack(app, 'App-s3Stack');
new AppStack(app, 'App-cicdStack');