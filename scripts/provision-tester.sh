#!/usr/bin/env bash
# Owner-only. Supply intended numeric Twitch ID on stdin; never put it in shell arguments/history.
set +x
set -euo pipefail
export DIME_TESTER_IDENTITY_KEY_B64='{{resolve:secretsmanager:arn:aws:secretsmanager:us-east-2:861738068626:secret:dime/web/identity-key-kL7iYK:SecretString}}'
exec asm-exec -- node --import tsx scripts/provision-tester.ts
