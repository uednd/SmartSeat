CREATE TABLE "oidc_auth_states" (
    "state_id" TEXT NOT NULL,
    "state_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oidc_auth_states_pkey" PRIMARY KEY ("state_id")
);

CREATE UNIQUE INDEX "oidc_auth_states_state_hash_key" ON "oidc_auth_states"("state_hash");
CREATE INDEX "oidc_auth_states_expires_at_idx" ON "oidc_auth_states"("expires_at");
CREATE INDEX "oidc_auth_states_consumed_at_idx" ON "oidc_auth_states"("consumed_at");
