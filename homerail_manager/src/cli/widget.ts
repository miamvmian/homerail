#!/usr/bin/env node
import * as fs from "node:fs";
import {
  listWidgetFileTypes,
  validateWidgetToml,
  widgetTomlExample,
  type WidgetFileType,
} from "../widgets/widget-file-protocol.js";

function usage(): never {
  console.error([
    "Usage:",
    "  widget validate <file> --type <widget_type>",
    "  widget render <file> --type <widget_type>",
    "  widget example <widget_type>",
    "  widget types",
  ].join("\n"));
  process.exit(2);
}

function parseType(args: string[]): WidgetFileType | undefined {
  const typeIndex = args.findIndex((arg) => arg === "--type" || arg === "-t");
  if (typeIndex >= 0) {
    const raw = args[typeIndex + 1];
    if (!raw) usage();
    return raw as WidgetFileType;
  }
  return undefined;
}

function assertWidgetType(raw: string | undefined): WidgetFileType {
  if (!raw || !listWidgetFileTypes().includes(raw as WidgetFileType)) {
    console.error(`widget_type must be one of: ${listWidgetFileTypes().join(", ")}`);
    process.exit(2);
  }
  return raw as WidgetFileType;
}

function readFileArg(args: string[]): string {
  const file = args.find((arg) => !arg.startsWith("-") && arg !== "validate" && arg !== "render");
  if (!file) usage();
  return fs.readFileSync(file, "utf8");
}

const args = process.argv.slice(2);
const command = args[0];

if (command === "types") {
  console.log(JSON.stringify({ widget_types: listWidgetFileTypes() }, null, 2));
  process.exit(0);
}

if (command === "example") {
  const type = assertWidgetType(args[1]);
  process.stdout.write(widgetTomlExample(type));
  process.exit(0);
}

if (command === "validate" || command === "render") {
  const type = assertWidgetType(parseType(args));
  const toml = readFileArg(args.slice(1));
  const result = validateWidgetToml(toml, type);
  if (command === "render" && result.ok) {
    console.log(JSON.stringify(result.widget, null, 2));
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
  process.exit(result.ok ? 0 : 1);
}

usage();
