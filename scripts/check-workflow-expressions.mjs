import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const workflowPath = path.join(rootDir, '.github', 'workflows', 'desktop-build.yml');

// 1. Structural check on workflow content
const yamlContent = fs.readFileSync(workflowPath, 'utf8');

// ponytail: kiểm tra cấu trúc theo dòng; chuyển sang parser YAML nếu workflow phức tạp hơn.
assert(yamlContent.includes('- master'), 'desktop-build.yml must include master branch');
assert(yamlContent.includes('- staging'), 'desktop-build.yml must include staging branch');
assert(yamlContent.includes("if: ${{ github.ref_name != 'staging' }}"), 'desktop-build.yml must skip steps when ref_name == staging');

// 2. Logic simulation of step conditional expressions
// Staging push / dispatch input true skips tests, builds artifacts, no release
// Master push tests + normal build, dispatch publish tests + release
// v tag tests + release
// Phase branch retains tests

function evaluateWorkflowConditions({ ref_name, ref, publish_to_taskmate }) {
  const isStaging = ref_name === 'staging';
  const isVTag = typeof ref === 'string' && ref.startsWith('refs/tags/v');
  const publishFlag = Boolean(publish_to_taskmate);

  // Expression: github.ref_name != 'staging'
  const runKnowledgeServer = !isStaging;
  const runNpmTest = !isStaging;

  // Expression: github.ref_name == 'staging' || (!startsWith(github.ref, 'refs/tags/v') && !inputs.publish_to_taskmate)
  const runTauriNormalBuild = isStaging || (!isVTag && !publishFlag);

  // Expression: github.ref_name != 'staging' && (startsWith(github.ref, 'refs/tags/v') || inputs.publish_to_taskmate)
  const runTauriPublishBuild = !isStaging && (isVTag || publishFlag);

  return {
    runKnowledgeServer,
    runNpmTest,
    runTauriNormalBuild,
    runTauriPublishBuild,
  };
}

// Case 1: staging push -> skips tests, normal build, no release
{
  const res = evaluateWorkflowConditions({
    ref_name: 'staging',
    ref: 'refs/heads/staging',
    publish_to_taskmate: false,
  });
  assert.equal(res.runKnowledgeServer, false, 'staging push: knowledge server must be skipped');
  assert.equal(res.runNpmTest, false, 'staging push: npm test must be skipped');
  assert.equal(res.runTauriNormalBuild, true, 'staging push: normal desktop build must run');
  assert.equal(res.runTauriPublishBuild, false, 'staging push: publish release must be false');
}

// Case 2: staging dispatch with publish_to_taskmate=true -> skips tests, normal build, NO release guard holds
{
  const res = evaluateWorkflowConditions({
    ref_name: 'staging',
    ref: 'refs/heads/staging',
    publish_to_taskmate: true,
  });
  assert.equal(res.runKnowledgeServer, false, 'staging dispatch: knowledge server must be skipped');
  assert.equal(res.runNpmTest, false, 'staging dispatch: npm test must be skipped');
  assert.equal(res.runTauriNormalBuild, true, 'staging dispatch: normal desktop build must run');
  assert.equal(res.runTauriPublishBuild, false, 'staging dispatch: publish release must NEVER run on staging');
}

// Case 3: master push -> runs tests, normal build, no release
{
  const res = evaluateWorkflowConditions({
    ref_name: 'master',
    ref: 'refs/heads/master',
    publish_to_taskmate: false,
  });
  assert.equal(res.runKnowledgeServer, true, 'master push: knowledge server must run');
  assert.equal(res.runNpmTest, true, 'master push: npm test must run');
  assert.equal(res.runTauriNormalBuild, true, 'master push: normal desktop build must run');
  assert.equal(res.runTauriPublishBuild, false, 'master push: publish must not run on simple push');
}

// Case 4: master dispatch publish -> runs tests, publish build (no duplicate normal build)
{
  const res = evaluateWorkflowConditions({
    ref_name: 'master',
    ref: 'refs/heads/master',
    publish_to_taskmate: true,
  });
  assert.equal(res.runKnowledgeServer, true, 'master publish dispatch: knowledge server must run');
  assert.equal(res.runNpmTest, true, 'master publish dispatch: npm test must run');
  assert.equal(res.runTauriNormalBuild, false, 'master publish dispatch: normal build should not duplicate');
  assert.equal(res.runTauriPublishBuild, true, 'master publish dispatch: publish build must run');
}

// Case 5: v tag -> runs tests, publish build
{
  const res = evaluateWorkflowConditions({
    ref_name: 'v1.2.0',
    ref: 'refs/tags/v1.2.0',
    publish_to_taskmate: false,
  });
  assert.equal(res.runKnowledgeServer, true, 'v tag: knowledge server must run');
  assert.equal(res.runNpmTest, true, 'v tag: npm test must run');
  assert.equal(res.runTauriNormalBuild, false, 'v tag: normal build should not duplicate');
  assert.equal(res.runTauriPublishBuild, true, 'v tag: publish build must run');
}

// Case 6: phase branch (e.g. phase-16-desktop-build) -> runs tests, normal build
{
  const res = evaluateWorkflowConditions({
    ref_name: 'phase-16-desktop-build',
    ref: 'refs/heads/phase-16-desktop-build',
    publish_to_taskmate: false,
  });
  assert.equal(res.runKnowledgeServer, true, 'phase branch: knowledge server must run');
  assert.equal(res.runNpmTest, true, 'phase branch: npm test must run');
  assert.equal(res.runTauriNormalBuild, true, 'phase branch: normal build must run');
  assert.equal(res.runTauriPublishBuild, false, 'phase branch: publish must not run');
}

console.log('ALL WORKFLOW EXPRESSION CHECKS PASSED');
