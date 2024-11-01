#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
//import { TalesofsubaInfraCdkStack } from "../lib/infra-cdk-stack";
//import { KnowUrCircleInfraCdkStack } from "../lib/infra-cdk-stack";
//import { SSNDigitalMediaInfraCdkStack } from "../lib/infra-cdk-stack";
import { SSNMobileAppInfraCdkStack } from "../lib/infra-cdk-stack";
import * as process from "process";

const app = new cdk.App();
new SSNMobileAppInfraCdkStack(app, "SSNMobileAppInfraCdkStack", {
  env: {
    account: "949365052778",
    //region: "ap-south-1",
    region: "us-east-1",
  },
});
