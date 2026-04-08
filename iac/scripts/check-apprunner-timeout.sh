#!/bin/bash
# =============================================================================
# check-apprunner-timeout.sh
#
# Reads the current App Runner service configuration and shows every
# timeout-related setting so you can confirm what is (and isn't) configurable.
#
# Usage:
#   ./iac/scripts/check-apprunner-timeout.sh [prod|dev]
#
# Requirements: aws CLI, jq
# =============================================================================
set -euo pipefail

ENVIRONMENT="${1:-prod}"
AWS_REGION="${AWS_REGION:-us-east-2}"

case "$ENVIRONMENT" in
  prod|production) SERVICE_NAME="cv-mcp-server-prod" ;;
  dev|develop)     SERVICE_NAME="cv-mcp-server-dev"  ;;
  *)
    echo "Usage: $0 [prod|dev]"
    exit 1
    ;;
esac

echo "=== App Runner Timeout Diagnostic ==="
echo "Service  : $SERVICE_NAME"
echo "Region   : $AWS_REGION"
echo "======================================"

# ── 1. Look up service ARN ──────────────────────────────────────────────────
SERVICE_ARN=$(aws apprunner list-services \
  --region "$AWS_REGION" \
  --query "ServiceSummaryList[?ServiceName=='$SERVICE_NAME'].ServiceArn" \
  --output text)

if [ -z "$SERVICE_ARN" ] || [ "$SERVICE_ARN" = "None" ]; then
  echo "❌  Service '$SERVICE_NAME' not found in region $AWS_REGION."
  echo "    Available services:"
  aws apprunner list-services --region "$AWS_REGION" \
    --query "ServiceSummaryList[].ServiceName" --output table
  exit 1
fi

echo "Service ARN : $SERVICE_ARN"
echo

# ── 2. Pull full service descriptor ─────────────────────────────────────────
SERVICE_JSON=$(aws apprunner describe-service \
  --region "$AWS_REGION" \
  --service-arn "$SERVICE_ARN")

# ── 3. Health-check configuration (user-configurable) ───────────────────────
echo "--- Health Check Configuration (configurable via update-service) ---"
echo "$SERVICE_JSON" | jq '.Service.HealthCheckConfiguration // "not set"'

echo
echo "Field meanings:"
echo "  Protocol  - HTTP or TCP"
echo "  Path      - HTTP path polled (default /)"
echo "  Interval  - seconds between polls (default 5)"
echo "  Timeout   - seconds App Runner waits for ONE health-check response"
echo "              (default 2, max 20 — this is NOT the HTTP request timeout)"
echo "  HealthyThreshold   - consecutive successes before marking healthy"
echo "  UnhealthyThreshold - consecutive failures before marking unhealthy"
echo

# ── 4. Instance / auto-scaling configuration ────────────────────────────────
echo "--- Instance Configuration ---"
echo "$SERVICE_JSON" | jq '.Service.InstanceConfiguration // "not set"'
echo

echo "--- Auto Scaling Configuration ---"
echo "$SERVICE_JSON" | jq '.Service.AutoScalingConfigurationSummary // "not set"'
echo

# ── 5. Network / ingress ─────────────────────────────────────────────────────
echo "--- Network Configuration ---"
echo "$SERVICE_JSON" | jq '.Service.NetworkConfiguration // "not set"'
echo

# ── 6. Service URL for a live timing test ────────────────────────────────────
SERVICE_URL=$(echo "$SERVICE_JSON" | jq -r '.Service.ServiceUrl')

echo "======================================================================"
echo "⚠️   HTTP REQUEST TIMEOUT — IMPORTANT NOTE"
echo "======================================================================"
echo
echo "AWS App Runner does NOT expose a configurable HTTP request/connection"
echo "timeout through the update-service API.  Its internal proxy uses a"
echo "platform-level idle timeout that defaults to ~120 seconds."
echo
echo "This matches exactly what is seen in the Cursor MCP client logs:"
echo "  08:42:30 → list_conversations POSTed"
echo "  08:44:31 → upstream request timeout  (121 seconds later)"
echo
echo "The timeout is either:"
echo "  (A) App Runner's internal proxy cutting the connection at 120 s, OR"
echo "  (B) The Cursor / MCP SDK client's own fetch() timeout at 120 s."
echo
echo "Run the live test below to determine which it is."
echo
echo "======================================================================"
echo "LIVE TIMING TEST — confirms where the 120-second timeout originates"
echo "======================================================================"
echo
echo "This sends a POST to the health endpoint and measures round-trip time."
echo "If App Runner cuts it at 120 s you will see a connection reset."
echo "If the server responds quickly, the timeout is client-side."
echo
echo "Quick probe (should return in < 1 s if service is healthy):"
echo "  curl -sS -o /dev/null -w '%{http_code}  time=%{time_total}s' \\"
echo "    https://${SERVICE_URL}/health"
echo
echo "Long-running test — simulate a slow POST and watch when it is cut:"
echo "  # Replace <BEARER_TOKEN> with a valid OAuth token."
echo "  curl -sS --max-time 200 -o /dev/null -w '%{http_code}  time=%{time_total}s' \\"
echo "    -X POST https://${SERVICE_URL}/ \\"
echo "    -H 'Authorization: Bearer <BEARER_TOKEN>' \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"id\":1,\"params\":{\"name\":\"slow_tool\"}}'"
echo "  # If it cuts at ~120 s → App Runner proxy limit."
echo "  # If curl reaches 200 s → timeout is client-side (MCP SDK)."
echo
echo "======================================================================"
echo "WHAT CAN ACTUALLY BE CHANGED"
echo "======================================================================"
echo
echo "✅ Configurable today (via update-service):"
echo "   • HealthCheckConfiguration.Timeout   (max 20 s, health probes only)"
echo "   • HealthCheckConfiguration.Interval"
echo "   • HealthCheckConfiguration.Path"
echo "   • InstanceConfiguration.Cpu / Memory"
echo "   • AutoScaling min/max concurrency"
echo
echo "❌ NOT configurable in App Runner (platform constraint):"
echo "   • HTTP connection idle timeout for live requests (~120 s fixed)"
echo
echo "Workarounds for long-running tool calls:"
echo "  1. Reduce tool latency so calls complete within ~90 s."
echo "  2. Add a keep-alive flush in SSE/streaming before the response:"
echo "     SSE GET keeps the stream alive; POST responses must be fast."
echo "  3. Migrate the service to ECS Fargate + ALB, where the ALB"
echo "     --connection-idle-timeout is configurable up to 4000 seconds."
echo "  4. Use an SQS-backed async pattern: POST enqueues, client polls."
echo
echo "The immediate code fix (req.on('close') detection already applied)"
echo "ensures the server cleans up promptly when the client gives up,"
echo "preventing the MCP_TRANSPORT_SEND_ERROR cascade."
