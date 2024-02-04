#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { TalesofsubaInfraCdkStack } from '../lib/talesofsuba-infra-cdk-stack';
import * as process from 'process';


const app = new cdk.App();
new TalesofsubaInfraCdkStack(app, 'TalesofsubaInfraCdkStack', {
    env: {
      account: '949365052778',
      region: 'ap-south-1',
    },
});
