# Kubernetes Deployment Runbook: Knowledge Stack

This guide documents deploying the production Neo4j and Knowledge Server stack to an internal Kubernetes cluster (e.g., inside the SHB internal network).

## Architecture & Topology

- **Neo4j 5.26 Community**: Runs as a single-replica `StatefulSet` with a 10Gi `PersistentVolumeClaim` mounted at `/data`. Fronted by a strictly cluster-internal `ClusterIP` Service on ports `7687` (Bolt) and `7474` (HTTP). Neo4j is never exposed outside the cluster.
- **Knowledge Server**: Runs as a single-replica `Deployment` exposed externally via a `NodePort` Service on port `30080` (mapped to targetPort `3001`). A 1Gi `ReadWriteOnce` PVC mounted at `/var/lib/knowledge-server` persists published source snapshots across `Recreate` rollouts. Communicates with Neo4j via cluster DNS (`bolt://neo4j:7687`).
- **Secrets**: Separated into external Kubernetes secrets. Zero cleartext credentials or Base64 secrets are stored in version control.

---

## Step 1: Pre-flight Secret Creation

Before applying any manifests, create the required secrets using `kubectl`.

### 1.1 Neo4j Credentials

```bash
kubectl create secret generic neo4j-credentials \
  --from-literal=NEO4J_AUTH="neo4j/YourStrongNeo4jPassword" \
  --from-literal=NEO4J_USER="neo4j" \
  --from-literal=NEO4J_PASSWORD="YourStrongNeo4jPassword"
```

### 1.2 Knowledge Server Secrets

```bash
kubectl create secret generic knowledge-server-secrets \
  --from-literal=KNOWLEDGE_SERVER_TOKEN="your-strong-random-daemon-token" \
  --from-literal=PLANNER_API_KEY="your-9router-or-openai-api-key"
```

Verify secrets exist:
```bash
kubectl get secrets neo4j-credentials knowledge-server-secrets
```

---

## Step 2: Deploy Neo4j

Deploy Neo4j first so its persistent volume claims and services are established:

```bash
kubectl apply -f k8s/neo4j.yaml
```

### 2.1 Verify Neo4j Readiness

Check PVC status:
```bash
kubectl get pvc neo4j-data-neo4j-0
```

Wait for Neo4j pod to become ready:
```bash
kubectl rollout status statefulset/neo4j --timeout=120s
kubectl get pods -l app=neo4j
```

---

## Step 3: Deploy Knowledge Server

Once Neo4j is in `Running` state and reporting healthy:

```bash
kubectl apply -f k8s/knowledge-server.yaml
```

### 3.1 Verify Knowledge Server Rollout

```bash
kubectl rollout status deployment/knowledge-server --timeout=120s
kubectl get pods -l app=knowledge-server
kubectl get pvc knowledge-server-data
```

The first rollout creates an empty snapshot volume. Republish approved Document Sets once through the normal TaskMate DLP preview and confirmation flow before requesting a graph rebuild. Later rollouts reload those snapshots from `SNAPSHOT_STORAGE_DIR`.

### 3.2 Smoke Test Health Endpoint

From a host within the internal network that can access the cluster node IP:

```bash
NODE_IP="<cluster-node-ip>"
TOKEN="your-strong-random-daemon-token"

curl -i -H "Authorization: Bearer $TOKEN" http://${NODE_IP}:30080/api/v1/health
```

Expected response:
```json
{"status":"ok","version":"0.1.0","neo4j":{"connected":true},"features":{"remotePlanner":true}}
```

---

## Step 4: Configure TaskMate UI

1. Open TaskMate in your browser (`https://taskmate.internal.shb.vn`).
2. Go to **Settings** -> **Knowledge Daemon**.
3. Set **Endpoint URL**: `http://<cluster-node-ip>:30080` (or reverse-proxied HTTPS URL).
4. Set **Daemon Token**: enter the token configured in `KNOWLEDGE_SERVER_TOKEN`.
5. Click **Test Connection** to verify live connection.
