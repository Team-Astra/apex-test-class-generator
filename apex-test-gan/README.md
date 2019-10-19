# Salesforce Auto Test Class Generator

![demo](https://raw.githubusercontent.com/Nik-Creation/Salesforce-LWC/master/testClassDemo.gif)

## Overview

This extension is a companion for Salesforce `Apex Code Coverage` development with Visual Studio Code. It is targeted at developers who want a lightweight and fast way to work with their Salesforce Apex Test Class files. There's no complicated setup process or project configurations.

## Prerequisites

Before you set up this extension for VS Code, make sure that you have these essentials

* [Salesforce CLI](https://developer.salesforce.com/docs/atlas.en-us.sfdx_setup.meta/sfdx_setup/sfdx_setup_intro.htm)
* [Salesforce Extension Pack](https://marketplace.visualstudio.com/items?itemName=salesforce.salesforcedx-vscode)
* [Visual Studio Code](https://code.visualstudio.com/download) `v1.38` or `later`
* Windows OS

## Important

To use this extension, you must follow this step!

* It’s compulsory to `set default org` before using this tool.
* If you `set default org`, do reload your vs code if needed.

## Release Notes

**Initial release `v1.0.0 ( Beta )`**

* This extension read queries and create random test data according to field data types.
* It populate correct picklist values from set of active values.
* This will automatically create classes based on `apiVersion` of class `(default : 47.0)`.
  