#!/bin/bash
# =============================================================================
# update-apprunner-instance-size.sh
#
# Scales the App Runner service VERTICALLY (bigger CPU / memory per instance).
#
# IMPORTANT — why horizontal scaling (MaxSize > 1) does NOT work here:
#   Sessions are stored in a plain in-memory Map<string, Session>.  Each
#   Session holds a live StreamableHTTPServerTransport with open req/res
#   handles.  These are not serializable and cannot be shared across
#   processes.  If two instances run simultaneously, a client that was
#   assigned to instance A will get "Session not found" on any request
#   that routes to instance B, because instance B has no knowledge of
#   that session.  App Runner's built-in load balancer does not support
#   sticky-session (header- or cookie-based affinity), so the only safe
#   configuration is a single instance (MaxSize = 1).
#
# Available instance sizes (App Runner):
#   CPU   Memory  Notes
#   0.25  0.5 GB  Dev/test only
#   0.5   1 GB    Dev/test only
#   1     2 GB
#   1     4 GB    ← CURRENT
#   2     4 GB    ← Recommended (doubles CPU headroom)
#   4     12 GB   ← Maximum (4× CPU, larger memory pool)
#
# Usage:
#   ./iac/scripts/update-apprunner-instance-size.sh [prod|dev] [CPU] [MEMORY_MB]
#
# Examples:
#   ./iac/scripts/update-apprunner-instance-size.sh prod 2048 4096
#   ./iac/scripts/update-apprunner-instance-size.sh prod 4096 12288
#
# Requirements: aws CLI, jq
# =============================================================================
set -euo pipefail

ENVIRONMENT="${1:-prod}"
NEW_CPU="${2:-2048}"      # millicores: 256 | 512 | 1024 | 2048 | 4096
NEW_MEMORY="${3:-4096}"   # MB:         512 | 1024 | 2048 | 3072 | 4096 | 6144 | 8192 | 10240 | 12288
AWS_REGION="${AWS_REGION:-us-east-2}"

case "$ENVIRONMENT" in
  prod|production) SERVICE_NAME="cv-mcp-server-prod" ;;
  dev|develop)     SERVICE_NAME="cv-mcp-server-dev"  ;;
  *)
    echo "Usage: $0 [prod|dev] [CPU_MILLICORES] [MEMORY_MB]"
    echo "  CPU_MILLICORES: 256 | 512 | 1024 | 2048 | 4096"
    echo "  MEMORY_MB     : 512 | 1024 | 2048 | 3072 | 4096 | 6144 | 8192 | 10240 | 12288"
    exit 1
    ;;
esac

# Validate CPU/memory combinations App Runner actually supports
case "${NEW_CPU}:${NEW_MEMORY}" in
  256:512|512:1024|1024:2048|1024:3072|1024:4096|2048:4096|2048:6144|2048:8192|4096:8192|4096:10240|4096:12288)
    ;;
  *)
    echo "❌  Invalid CPU/memory combination: ${NEW_CPU} mCPU / ${NEW_MEMORY} MB"
    echo "    Valid pairs:"
    echo "      256:512   512:1024   1024:2048   1024:3072   1024:4096"
    echo "      2048:4096  2048:6144  2048:8192"
    echo "      4096:8192  4096:10240  4096:12288"
    exit 1
    ;;
esac

echo "=== App Runner Vertical Scaling ==="
echo "Service    : $SERVICE_NAME"
echo "Region     : $AWS_REGION"
echo "New CPU    : ${NEW_CPU} millicores  ($(echo "scale=2; $NEW_CPU/1024" | bc) vCPU)"
echo "New Memory : ${NEW_MEMORY} MB"
echo "==================================="
echo
echo "⚠️  NOTE: MaxSize is intentionally left at 1."
echo "   Sessions are in-memory and tied to a live transport."
echo "   Multiple instances would cause 'Session not found' for"
echo "   any request that lands on the wrong instance."
echo

# ── Look up service ARN ──────────────────────────────────────────────────────
echo "Looking up service ARN for $SERVICE_NAME..."
SERVICE_ARN=$(aws apprunner list-services \
  --region "$AWS_REGION" \
  --query "ServiceSummaryList[?ServiceName=='$SERVICE_NAME'].ServiceArn" \
  --output text)

if [ -z "$SERVICE_ARN" ] || [ "$SERVICE_ARN" = "None" ]; then
  echo "❌  Service '$SERVICE_NAME' not found in region $AWS_REGION."
  exit 1
fi
echo "Service ARN: $SERVICE_ARN"

# ── Show current instance size ───────────────────────────────────────────────
echo
echo "Current instance configuration:"
aws apprunner describe-service \
  --region "$AWS_REGION" \
  --service-arn "$SERVICE_ARN" \
  --query 'Service.InstanceConfiguration' \
  --output table

echo
read -r -p "Update to ${NEW_CPU} mCPU / ${NEW_MEMORY} MB? [y/N] " CONFIRM
if [[ "${CONFIRM,,}" != "y" ]]; then
  echo "Aborted."
  exit 0
fi

# ── Apply new instance size ───────────────────────────────────────────────────
echo
echo "Updating instance configuration..."

# Get current instance role ARN so we don't accidentally remove it
INSTANCE_ROLE_ARN=$(aws apprunner describe-service \
  --region "$AWS_REGION" \
  --service-arn "$SERVICE_ARN" \
  --query 'Service.InstanceConfiguration.InstanceRoleArn' \
  --output text)

INSTANCE_CONFIG="{\"Cpu\": \"$NEW_CPU\", \"Memory\": \"$NEW_MEMORY\""
if [ -n "$INSTANCE_ROLE_ARN" ] && [ "$INSTANCE_ROLE_ARN" != "None" ]; then
  INSTANCE_CONFIG="$INSTANCE_CONFIG, \"InstanceRoleArn\": \"$INSTANCE_ROLE_ARN\""
fi
INSTANCE_CONFIG="$INSTANCE_CONFIG}"

aws apprunner update-service \
  --region "$AWS_REGION" \
  --service-arn "$SERVICE_ARN" \
  --instance-configuration "$INSTANCE_CONFIG" \
  > /dev/null

echo "✅ Instance configuration update initiated."
echo
echo "⏳ Waiting for service to return to RUNNING state..."

MAX_WAIT=900
WAITED=0
INTERVAL=20

while [ $WAITED -lt $MAX_WAIT ]; do
  STATUS=$(aws apprunner describe-service \
    --region "$AWS_REGION" \
    --service-arn "$SERVICE_ARN" \
    --query "Service.Status" --output text)
  echo "  Status: $STATUS  (${WAITED}s elapsed)"

  if [ "$STATUS" = "RUNNING" ]; then
    echo
    echo "✅ Service is RUNNING with new instance size."
    break
  fi

  if [[ "$STATUS" == *"FAILED"* ]]; then
    echo "❌ Update failed: $STATUS"
    exit 1
  fi

  sleep $INTERVAL
  WAITED=$((WAITED + INTERVAL))
done

if [ $WAITED -ge $MAX_WAIT ]; then
  echo "❌ Timed out. Check the AWS console."
  exit 1
fi

# ── Verify ───────────────────────────────────────────────────────────────────
echo
echo "=== Verified instance configuration ==="
aws apprunner describe-service \
  --region "$AWS_REGION" \
  --service-arn "$SERVICE_ARN" \
  --query 'Service.InstanceConfiguration' \
  --output table

echo
echo "=== Next steps ==="
echo "  • Monitor tool call latency in CloudWatch — if tool calls now"
echo "    complete in < 90 s, the timeout problem is resolved."
echo "  • If latency is still high, the bottleneck is the Carbon Voice API,"
echo "    not the MCP server itself (vertical scaling won't help further)."
echo "  • Long-term: moving to a stateless session model removes the"
echo "    single-instance constraint and allows horizontal scaling."
