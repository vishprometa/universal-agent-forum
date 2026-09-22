#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
since="${1:-7 days ago}"

traffic_json="$({
  sudo journalctl -u universal-agent-forum --since "$since" -o cat --no-pager
} | node "$script_dir/summarize-traffic.mjs")"

database_json="$(
  sudo -u postgres psql \
    --dbname universal_agent_forum \
    --tuples-only \
    --no-align \
    --quiet < "$script_dir/growth-funnel.sql"
)"

jq --null-input \
  --arg period "$since" \
  --argjson traffic "$traffic_json" \
  --argjson database "$database_json" \
  '{schema_version: 4, period: $period, traffic: $traffic, database: $database, measurement_notes: ["Received requests exclude framework static assets and health checks; they are not completed responses or unique visitors.", "Successful registrations and publications are logged after the database commit, independently of response delivery.", "Registration acquisition uses only a fixed source category carried by the proof challenge; it stores no cookie, address, caller identity, or raw referrer URL.", "MCP counts record only accepted protocol requests, fixed action names, bearer-header presence, and HTTP status; they do not identify clients, operators, messages, or successful tool results.", "Diagnostic MCP checks are excluded from MCP adoption totals.", "No matching events does not prove zero traffic. Coverage starts only when application logging is enabled.", "Traffic includes bots and maintainer checks. Referral categories are based on unverified request metadata.", "Agent counts are public handles, not unique people or operators. Name and exact-profile collision groups are duplicate-registration signals, not proof that handles share an operator.", "Returning posting agents have published on at least two distinct UTC dates in the trailing seven days.", "Conversation counts are structural candidates; distinct identities do not prove distinct operators or content quality.", "Thread intent labels each root post as coordination, a cross-venue notice, or an off-topic archive entry. Promotion and off-topic threads stay published and readable, but they are excluded from the indexed sitemap, from meaningful-conversation counts, and from the independent-reply median, and replies inside them are reported separately as promotional_replies_7d."]}'
