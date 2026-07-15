#!/usr/bin/env bash
#
# Creates the IAM user that the Vercel app uses to reach DynamoDB, scoped to
# this table only, and prints the credentials to paste into Vercel.
#
# Run it yourself with an admin profile, AFTER the table exists (it reads the
# ARN from the stack). See scripts/setup-github-secrets.sh for the pipeline's
# own, separate deploy user.
#   ./scripts/setup-aws.sh --profile radamuz
#
# Safe to re-run: the user and policy are reconciled, not duplicated. A new
# access key is only created when you pass --new-key (AWS allows 2 per user).
#
set -euo pipefail

PROFILE=""
REGION="eu-west-1"
STACK_NAME="balears-app"
USER_NAME="balears-app-vercel"
POLICY_NAME="balears-app-dynamodb"
NEW_KEY=false

usage() {
  cat <<EOF
Usage: $0 --profile <aws-profile> [options]

Options:
  --profile <name>   AWS CLI profile to use (required)
  --region <name>    AWS region (default: $REGION)
  --stack <name>     CloudFormation stack name (default: $STACK_NAME)
  --new-key          Create a new access key even if one already exists
  -h, --help         Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile) PROFILE="${2:-}"; shift 2 ;;
    --region)  REGION="${2:-}"; shift 2 ;;
    --stack)   STACK_NAME="${2:-}"; shift 2 ;;
    --new-key) NEW_KEY=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ -z "$PROFILE" ]]; then
  echo "error: --profile is required" >&2
  usage
  exit 1
fi

aws() { command aws --profile "$PROFILE" --region "$REGION" "$@"; }

echo "==> Checking credentials for profile '$PROFILE'…"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "    Account: $ACCOUNT_ID  Region: $REGION"

# The table must exist first — the pipeline (or a manual stack deploy) creates
# it. We read its ARN from the stack so the policy is scoped to exactly it.
echo "==> Reading table ARN from stack '$STACK_NAME'…"
if ! TABLE_ARN=$(aws cloudformation describe-stacks \
      --stack-name "$STACK_NAME" \
      --query "Stacks[0].Outputs[?OutputKey=='TableArn'].OutputValue" \
      --output text 2>/dev/null) || [[ -z "$TABLE_ARN" || "$TABLE_ARN" == "None" ]]; then
  echo "error: could not read TableArn from stack '$STACK_NAME'." >&2
  echo "       The table must exist first. Either:" >&2
  echo "         a) ./scripts/setup-github-secrets.sh --profile $PROFILE" >&2
  echo "            then GitHub > Actions > 'Deploy infra (DynamoDB)' > Run workflow" >&2
  echo "         b) deploy it locally:" >&2
  echo "            aws --profile $PROFILE --region $REGION cloudformation deploy \\" >&2
  echo "              --template-file infra/dynamodb.yml --stack-name $STACK_NAME" >&2
  exit 1
fi
TABLE_NAME=$(basename "$TABLE_ARN")
echo "    Table: $TABLE_NAME"

echo "==> Ensuring IAM user '$USER_NAME'…"
if aws iam get-user --user-name "$USER_NAME" >/dev/null 2>&1; then
  echo "    Already exists."
else
  aws iam create-user --user-name "$USER_NAME" >/dev/null
  echo "    Created."
fi

# Least privilege: only the calls the app actually makes, only on this table.
echo "==> Writing inline policy '$POLICY_NAME'…"
aws iam put-user-policy \
  --user-name "$USER_NAME" \
  --policy-name "$POLICY_NAME" \
  --policy-document "$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:BatchWriteItem"
      ],
      "Resource": "$TABLE_ARN"
    }
  ]
}
EOF
)"
echo "    Policy scoped to $TABLE_ARN"

EXISTING_KEYS=$(aws iam list-access-keys --user-name "$USER_NAME" \
  --query 'length(AccessKeyMetadata)' --output text)

if [[ "$EXISTING_KEYS" -gt 0 && "$NEW_KEY" == false ]]; then
  echo
  echo "==> User already has $EXISTING_KEYS access key(s); not creating another."
  echo "    Secrets are only shown by AWS at creation time, so if you no longer"
  echo "    have it, re-run with --new-key (then delete the stale one)."
  echo
  echo "Set these in Vercel (Settings > Environment Variables) and as GitHub secrets:"
  echo "  AWS_REGION=$REGION"
  echo "  DYNAMODB_TABLE=$TABLE_NAME"
  exit 0
fi

echo "==> Creating access key…"
KEY_JSON=$(aws iam create-access-key --user-name "$USER_NAME" --output json)
ACCESS_KEY_ID=$(echo "$KEY_JSON" | grep -o '"AccessKeyId": *"[^"]*"' | cut -d'"' -f4)
SECRET_KEY=$(echo "$KEY_JSON" | grep -o '"SecretAccessKey": *"[^"]*"' | cut -d'"' -f4)

# A fresh session secret for signing admin cookies (unrelated to AWS).
SESSION_SECRET=$(openssl rand -hex 32)

cat <<EOF

────────────────────────────────────────────────────────────────
  Add these to Vercel > Settings > Environment Variables
  (Production), then redeploy.
────────────────────────────────────────────────────────────────

  AWS_REGION=$REGION
  DYNAMODB_TABLE=$TABLE_NAME
  AWS_ACCESS_KEY_ID=$ACCESS_KEY_ID
  AWS_SECRET_ACCESS_KEY=$SECRET_KEY
  SESSION_SECRET=$SESSION_SECRET

────────────────────────────────────────────────────────────────
  The secret above is shown ONCE. Store it now.
  Do not commit it — .env is gitignored.
────────────────────────────────────────────────────────────────

Next:
  1. Paste the vars into Vercel (and into .env for local testing).
  2. Seed the mapping + create your admin user:
       node scripts/seed.js
────────────────────────────────────────────────────────────────
EOF
