# SPX Banking feature microservices on Amazon EKS

This repository replaces the monolithic Flask workload with feature-isolated Kubernetes Deployments. Each feature runs in a separate pod and is reached only through the NGINX API gateway. The gateway also serves the responsive SPX browser portal at `/`, with registration, login, account summary, and feature navigation wired to the microservice APIs.

## Pod-to-feature mapping

| Deployment | Feature | Public API prefix |
|---|---|---|
| `spx-auth` | Customer login and JWT creation | `/api/auth/` |
| `spx-registration` | New-customer registration | `/api/registration/` |
| `spx-payments` | Account-to-account payments | `/api/payments/` |
| `spx-statements` | Transaction statement queries | `/api/statements/` |
| `spx-admin` | Administrator login and user listing | `/api/admin/` |
| `spx-accounts` | Account profile and balance | `/api/accounts/` |
| `spx-loans` | Loan applications and loan history | `/api/loans/` |
| `spx-cards` | Card requests and card history | `/api/cards/` |
| `spx-investments` | Investment products and holdings | `/api/investments/` |
| `spx-insurance` | Insurance products and policies | `/api/insurance/` |
| `spx-services` | Customer-service catalog and requests | `/api/services/` |
| `spx-gateway` | External routing only | port 80 |
| `spx-mysql` | Persistent database | internal port 3306 |

The eleven feature Deployments use the same hardened service image but start with different `FEATURE` values. The runtime imports only the selected feature blueprint, so each pod exposes only its assigned feature. Each Deployment can be scaled, restarted, and released independently without changing its public API contract.

## Security model

- The gateway is the only public Service.
- Customer and administrator APIs use signed bearer tokens.
- Payment updates use one database transaction and row locks.
- Passwords and the administrator password are bcrypt hashes.
- Kubernetes Secrets are never committed.
- GitHub Actions obtains short-lived AWS credentials through OIDC.

This is an educational baseline. Before using it for real banking data, use Amazon RDS/Aurora, Secrets Manager, TLS, WAF, scoped service identities, audit logging, idempotency keys, fraud controls, and a proper identity provider.

## Required GitHub settings

Repository secret:

- `AWS_GITHUB_OIDC_ROLE_ARN`

Repository variables:

- `AWS_REGION=us-east-1`
- `EKS_CLUSTER_NAME=eks-spx`
- `ECR_APP_REPOSITORY` (shared feature-service image)
- `ECR_WEB_REPOSITORY` (gateway image)
- `ECR_DB_REPOSITORY` (database image)
- `DEPLOY_ENABLED=false` until preparation is complete

The AWS OIDC trust policy must use this repository's exact production-environment subject. Do not reuse the subject from the monolith repository.

## Create the Kubernetes Secret

Copy `k8s/base/secrets.example.yaml` to an untracked `secrets.yaml`, replace every `CHANGE_ME`, and apply it before enabling deployment:

`smtp-user` is the full email address of the sending mailbox. `smtp-password` is that mailbox's SMTP password (or app password). The login and registration OTP flows will not send mail until both values are present.

```bash
kubectl apply -f k8s/base/namespace.yaml
kubectl apply -f secrets.yaml
kubectl get secret spx-secrets -n spx-banking
```

## Deploy and verify

Set `DEPLOY_ENABLED=true`, run **Build and deploy SPX microservices**, then verify:

```bash
kubectl get pods,svc,pvc -n spx-banking
kubectl get deployments -n spx-banking -L spx.feature
kubectl get svc spx-gateway -n spx-banking
```

Expected feature pods are `spx-auth`, `spx-registration`, `spx-payments`, `spx-statements`, `spx-admin`, `spx-accounts`, `spx-loans`, `spx-cards`, `spx-investments`, `spx-insurance`, and `spx-services`, plus gateway and MySQL pods.

## API examples

Registration is a three-step flow: send an OTP, verify it, then create the account with the short-lived verification token. The web portal performs these steps automatically. Login similarly verifies the password, emails an OTP, and only issues a session token after OTP verification.

All dashboard services support real operations: transfers, loan applications, card requests, investments, insurance applications, service requests, and transaction history. Transfers require another existing SPX account and sufficient sender balance.

The gateway serves the original SPX Net Banking portal and preserves its legacy browser routes. Compatibility endpoints translate the original cookie-based frontend calls to the feature pods, so existing bookmarks under `/home/landingPage/...` continue to work while authentication, accounts, payments, statements, loans, cards, investments, insurance, and service requests remain independently deployed.

```bash
curl -X POST http://GATEWAY/api/registration/send-otp -H 'Content-Type: application/json' -d '{"email":"user@example.com","first_name":"Test"}'
```

Enter the OTP in the web portal to finish registration. Never store SMTP credentials in GitHub or commit a populated Secret manifest.

