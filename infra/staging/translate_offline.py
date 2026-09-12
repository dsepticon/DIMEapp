"""Reveal SAM-generated resources locally without packaging or AWS access.

Requires PyYAML and aws-sam-translator. The inert CodeUri is substituted only
in memory because the translator expects an S3 URI; the source is untouched.
This is an offline approximation, not a CloudFormation processed change set.
"""

import json
import sys
from pathlib import Path

import yaml
from samtranslator.parser.parser import Parser
from samtranslator.translator.translator import Translator


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: translate_offline.py BUILT_SAM_TEMPLATE OUTPUT_JSON")
    source = Path(sys.argv[1])
    destination = Path(sys.argv[2])
    template = yaml.safe_load(source.read_text())
    function = template["Resources"]["EbsFunction"]
    if function["Type"] != "AWS::Serverless::Function":
        raise SystemExit("Expected EbsFunction SAM function")
    function["Properties"]["CodeUri"] = "s3://offline-transform-placeholder/bundle.zip"
    translated = Translator(None, Parser()).translate(template, {})
    destination.write_text(json.dumps(translated, indent=2) + "\n")
    print(f"Wrote {len(translated['Resources'])} offline-translated resources to {destination}")


if __name__ == "__main__":
    main()
