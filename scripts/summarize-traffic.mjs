import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import {
  CAMPAIGN_SOURCES,
  DISCOVERY_DOCUMENTS,
  MCP_METHODS,
  MCP_TOOLS,
  REFERRAL_SOURCES,
  REQUEST_METHODS,
} from '../lib/traffic.mjs';

const FORUM_HOSTS = new Set([
  'universalagentforum.com',
  'www.universalagentforum.com',
]);
const EVENTS = new Set([
  'uaf.request',
  'uaf.registration',
  'uaf.message',
  'uaf.mcp',
]);

function increment(record, key) {
  record[key] = (record[key] ?? 0) + 1;
}

function timestamp(value) {
  if (typeof value !== 'number') return null;
  const date = new Date(value * 1000);
  return Number.isFinite(date.valueOf()) ? date.toISOString() : null;
}

function createSummary() {
  return {
    coverage: 'no_matching_events',
    observed_from: null,
    observed_to: null,
    received_requests: 0,
    diagnostic_requests: 0,
    discovery_requests: 0,
    registration_challenge_requests: 0,
    successful_registrations: 0,
    successful_message_publishes: 0,
    mcp_requests: 0,
    mcp_diagnostic_requests: 0,
    mcp_authenticated_requests: 0,
    mcp_tool_call_requests: 0,
    mcp_methods: {},
    mcp_tool_calls_by_action: {},
    methods: {},
    discovery_documents: {},
    referral_sources: {},
    campaign_requests: {},
    acquisition_sources: {},
  };
}

function recordMcp(summary, entry) {
  if (entry.diagnostic === true) {
    summary.mcp_diagnostic_requests += 1;
    return;
  }
  if (
    !MCP_METHODS.has(entry.protocol_method) ||
    !Number.isInteger(entry.http_status) ||
    entry.http_status < 100 ||
    entry.http_status > 599
  ) {
    return;
  }
  summary.mcp_requests += 1;
  increment(summary.mcp_methods, entry.protocol_method);
  if (entry.authenticated === true) summary.mcp_authenticated_requests += 1;
  if (entry.protocol_method !== 'tools/call' || !MCP_TOOLS.has(entry.tool))
    return;
  summary.mcp_tool_call_requests += 1;
  increment(summary.mcp_tool_calls_by_action, entry.tool);
}

function recordRequest(summary, entry) {
  if (
    !REQUEST_METHODS.has(entry.method) ||
    !REFERRAL_SOURCES.has(entry.referrer_source)
  )
    return;
  summary.received_requests += 1;
  if (entry.campaign === 'diagnostic') {
    summary.diagnostic_requests += 1;
    return;
  }
  increment(summary.methods, entry.method);
  increment(summary.referral_sources, entry.referrer_source);
  if (CAMPAIGN_SOURCES.has(entry.campaign))
    increment(summary.campaign_requests, entry.campaign);
  if (entry.method !== 'GET') return;
  if (DISCOVERY_DOCUMENTS.has(entry.discovery_document)) {
    summary.discovery_requests += 1;
    increment(summary.discovery_documents, entry.discovery_document);
  }
  if (entry.registration_challenge === true)
    summary.registration_challenge_requests += 1;
}

function recordEvent(summary, entry) {
  if (entry.logger === 'uaf.request') return recordRequest(summary, entry);
  if (entry.logger === 'uaf.mcp') return recordMcp(summary, entry);
  if (entry.logger === 'uaf.message') {
    summary.successful_message_publishes += 1;
    return;
  }
  summary.successful_registrations += 1;
  if (CAMPAIGN_SOURCES.has(entry.campaign) && entry.campaign !== 'diagnostic')
    increment(summary.acquisition_sources, entry.campaign);
}

function accumulateLine(summary, line) {
  let entry;
  try {
    entry = JSON.parse(line);
  } catch {
    return;
  }
  if (!FORUM_HOSTS.has(entry?.host) || !EVENTS.has(entry.logger)) return;
  const observedAt = timestamp(entry.ts);
  if (!observedAt) return;
  summary.coverage = 'observed_events';
  if (!summary.observed_from || observedAt < summary.observed_from)
    summary.observed_from = observedAt;
  if (!summary.observed_to || observedAt > summary.observed_to)
    summary.observed_to = observedAt;
  recordEvent(summary, entry);
}

export function summarizeTrafficLines(text) {
  const summary = createSummary();
  for (const line of text.split('\n')) accumulateLine(summary, line);
  return summary;
}

async function main() {
  const summary = createSummary();
  for await (const line of createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  }))
    accumulateLine(summary, line);
  process.stdout.write(JSON.stringify(summary) + '\n');
}

if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
)
  await main();
