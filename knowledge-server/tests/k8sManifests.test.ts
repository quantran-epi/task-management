import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Kubernetes Manifest Security and Syntax (D-01..D-05)', () => {
  const rootDir = path.resolve(import.meta.dirname, '../..');
  const neo4jPath = path.join(rootDir, 'k8s/neo4j.yaml');
  const ksPath = path.join(rootDir, 'k8s/knowledge-server.yaml');
  const readmePath = path.join(rootDir, 'k8s/README.md');

  it('both manifest files and runbook exist', () => {
    expect(fs.existsSync(neo4jPath)).toBe(true);
    expect(fs.existsSync(ksPath)).toBe(true);
    expect(fs.existsSync(readmePath)).toBe(true);
  });

  it('neo4j.yaml contains Service and StatefulSet without leaking secrets', () => {
    const content = fs.readFileSync(neo4jPath, 'utf8');

    // Structure checks
    expect(content).toContain('kind: Service');
    expect(content).toContain('kind: StatefulSet');
    expect(content).toContain('type: ClusterIP');
    expect(content).not.toContain('NodePort');
    expect(content).not.toContain('LoadBalancer');
    expect(content).toContain('mountPath: /data');

    // Secret safety: uses secretKeyRef exclusively
    expect(content).toContain('secretKeyRef:');
    expect(content).toContain('name: neo4j-credentials');

    // No hardcoded passwords or base64 data blobs
    expect(content).not.toMatch(/NEO4J_AUTH:\s*[^s\n]/);
    expect(content).not.toMatch(/password:\s*["']?[^$\s]/i);
  });

  it('knowledge-server.yaml contains ConfigMap, Service, and Deployment without leaking secrets', () => {
    const content = fs.readFileSync(ksPath, 'utf8');

    // Structure checks
    expect(content).toContain('kind: ConfigMap');
    expect(content).toContain('kind: Service');
    expect(content).toContain('kind: Deployment');
    expect(content).toContain('type: NodePort');
    expect(content).toContain('nodePort: 30080');

    // Published source snapshots survive Deployment rollouts.
    expect(content).toContain('kind: PersistentVolumeClaim');
    expect(content).toContain('name: knowledge-server-data');
    expect(content).toContain('accessModes: ["ReadWriteOnce"]');
    expect(content).toContain('storage: 1Gi');
    expect(content).toContain('SNAPSHOT_STORAGE_DIR: "/var/lib/knowledge-server/snapshots"');
    expect(content).toContain('mountPath: /var/lib/knowledge-server');
    expect(content).toContain('claimName: knowledge-server-data');
    expect(content).toMatch(/strategy:\s*\n\s+type: Recreate/);

    // Probes check port 3001 readiness
    expect(content).toMatch(/port:\s*3001/);

    // KNOWLEDGE_SERVER_BODY_LIMIT_BYTES configured in ConfigMap
    expect(content).toContain('KNOWLEDGE_SERVER_BODY_LIMIT_BYTES: "10485760"');

    // Secret safety: uses secretKeyRef exclusively
    expect(content).toContain('name: knowledge-server-secrets');
    expect(content).toContain('name: neo4j-credentials');

    // No cleartext tokens or passwords
    expect(content).not.toMatch(/KNOWLEDGE_SERVER_TOKEN:\s*["'][a-zA-Z0-9_-]{10,}["']/);
    expect(content).not.toMatch(/PLANNER_API_KEY:\s*["'][a-zA-Z0-9_-]{10,}["']/);
    expect(content).not.toMatch(/data:\s*\n\s+[A-Za-z0-9_-]+:\s*[A-Za-z0-9+/=]{20,}/); // no base64 secret payload
  });

  it('README.md documents pre-flight secret creation and apply order', () => {
    const readme = fs.readFileSync(readmePath, 'utf8');
    expect(readme).toContain('kubectl create secret generic neo4j-credentials');
    expect(readme).toContain('kubectl create secret generic knowledge-server-secrets');
    expect(readme).toContain('k8s/neo4j.yaml');
    expect(readme).toContain('k8s/knowledge-server.yaml');
    expect(readme).toContain('30080');
  });
});
