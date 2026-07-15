#!/usr/bin/env bash
#
# Creates the IAM user that GitHub Actions uses to deploy the CloudFormation
# stack, and prints the two secrets to paste into the repo settings.
#
# Run it yourself with an admin profile, BEFORE the first pipeline run:
#   ./scripts/setup-github-secrets.sh --profile radamuz
#
# This is the deploy identity (creates infrastructure) and is deliberately a
# different user from the app's (scripts/setup-aws.sh), which only reads and
# writes rows. Keeping them apart means the public web app holds no permission
# to create or delete tables.
#
# Nothing is uploaded anywhere: the secrets are printed for you to paste.
# Safe to re-run: the user and policy are reconciled, not duplicated.
#
set -euo pipefail

PROFILE=""
REGION="eu-west-1"
STACK_NAME="balears-app"
TABLE_NAME="balears-app"
USER_NAME="balears-app-github"
POLICY_NAME="balears-app-deploy"
NEW_KEY=false

usage() {
  cat <<EOF
Usage: $0 --profile <aws-profile> [options]

Creates the IAM user for the GitHub Actions deploy pipeline and prints the
AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY to add as repository secrets.

Options:
  --profile <name>   AWS CLI profile to use (required)
  --region <name>    AWS region (default: $REGION)
  --stack <name>     CloudFormation stack name (default: $STACK_NAME)
  --table <name>     DynamoDB table name (default: $TABLE_NAME)
  --new-key          Create a new access key even if one already exists
  -h, --help         Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile) PROFILE="${2:-}"; shift 2 ;;
    --region)  REGION="${2:-}"; shift 2 ;;
    --stack)   STACK_NAME="${2:-}"; shift 2 ;;
    --table)   TABLE_NAME="${2:-}"; shift 2 ;;
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

# Unlike the app's user, this one runs before the stack exists — it's what
# creates it — so the ARNs are composed rather than read from stack outputs.
STACK_ARN="arn:aws:cloudformation:${REGION}:${ACCOUNT_ID}:stack/${STACK_NAME}/*"
TABLE_ARN="arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/${TABLE_NAME}"

echo "==> Ensuring IAM user '$USER_NAME'…"
if aws iam get-user --user-name "$USER_NAME" >/dev/null 2>&1; then
  echo "    Already exists."
else
  aws iam create-user --user-name "$USER_NAME" >/dev/null
  echo "    Created."
fi

# Scoped to this stack and this table. CloudFormation acts on our behalf, hence
# the DynamoDB table permissions. ValidateTemplate and DescribeStacks take no
# resource, so they can only be granted on "*".
echo "==> Writing inline policy '$POLICY_NAME'…"
aws iam put-user-policy \
  --user-name "$USER_NAME" \
  --policy-name "$POLICY_NAME" \
  --policy-document "$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "CloudFormationStack",
      "Effect": "Allow",
      "Action": [
        "cloudformation:CreateStack",
        "cloudformation:UpdateStack",
        "cloudformation:DeleteChangeSet",
        "cloudformation:CreateChangeSet",
        "cloudformation:ExecuteChangeSet",
        "cloudformation:DescribeChangeSet",
        "cloudformation:DescribeStackEvents",
        "cloudformation:DescribeStackResource",
        "cloudformation:DescribeStackResources",
        "cloudformation:GetTemplateSummary",
        "cloudformation:ListStackResources"
      ],
      "Resource": "$STACK_ARN"
    },
    {
      "Sid": "CloudFormationGlobalReads",
      "Effect": "Allow",
      "Action": [
        "cloudformation:ValidateTemplate",
        "cloudformation:DescribeStacks"
      ],
      "Resource": "*"
    },
    {
      "Sid": "ManageTheTable",
      "Effect": "Allow",
      "Action": [
        "dynamodb:CreateTable",
        "dynamodb:UpdateTable",
        "dynamodb:DescribeTable",
        "dynamodb:DescribeTimeToLive",
        "dynamodb:UpdateTimeToLive",
        "dynamodb:DescribeContinuousBackups",
        "dynamodb:UpdateContinuousBackups",
        "dynamodb:ListTagsOfResource",
        "dynamodb:TagResource",
        "dynamodb:UntagResource"
      ],
      "Resource": "$TABLE_ARN"
    }
  ]
}
EOF
)"
echo "    Policy scoped to:"
echo "      stack $STACK_ARN"
echo "      table $TABLE_ARN"

EXISTING_KEYS=$(aws iam list-access-keys --user-name "$USER_NAME" \
  --query 'length(AccessKeyMetadata)' --output text)

if [[ "$EXISTING_KEYS" -gt 0 && "$NEW_KEY" == false ]]; then
  cat <<EOF

==> User already has $EXISTING_KEYS access key(s); not creating another.
    AWS only reveals a secret at creation time, so if you no longer have it,
    re-run with --new-key (then delete the stale key in the IAM console).
EOF
  exit 0
fi

echo "==> Creating access key…"
KEY_JSON=$(aws iam create-access-key --user-name "$USER_NAME" --output json)
ACCESS_KEY_ID=$(echo "$KEY_JSON" | grep -o '"AccessKeyId": *"[^"]*"' | cut -d'"' -f4)
SECRET_KEY=$(echo "$KEY_JSON" | grep -o '"SecretAccessKey": *"[^"]*"' | cut -d'"' -f4)

REPO_URL=$(git config --get remote.origin.url 2>/dev/null || echo "")
REPO_SLUG=$(echo "$REPO_URL" | sed -E 's#(git@|https://)github.com[:/]##; s#\.git$##')

cat <<EOF

────────────────────────────────────────────────────────────────
  GitHub > Settings > Secrets and variables > Actions
  > New repository secret — add these two:
EOF
[[ -n "$REPO_SLUG" ]] && echo "  https://github.com/$REPO_SLUG/settings/secrets/actions"
cat <<EOF
────────────────────────────────────────────────────────────────

  Name:   AWS_ACCESS_KEY_ID
  Value:  $ACCESS_KEY_ID

  Name:   AWS_SECRET_ACCESS_KEY
  Value:  $SECRET_KEY

────────────────────────────────────────────────────────────────
  The secret above is shown ONCE. Store it now.
────────────────────────────────────────────────────────────────

Next:
  1. Add both secrets in GitHub (link above).
  2. Run the pipeline: Actions > "Deploy infra (DynamoDB)" > Run workflow.
  3. Once the table exists, create the app's own credentials:
       ./scripts/setup-aws.sh --profile $PROFILE
────────────────────────────────────────────────────────────────
EOF
