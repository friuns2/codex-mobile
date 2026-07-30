import { describe, expect, it } from 'vitest'
import {
  callRpcWithRateLimitDecodeRecovery,
  recoverRateLimitsFromPlanTypeDecodeError,
} from './rateLimitDecodeRecovery'

const proliteDecodeError = new Error(`failed to fetch codex rate limits: Decode error for https://chatgpt.com/backend-api/codex/quotas: unknown variant prolite, expected one of guest, free, go, plus, pro, free_workspace, team, business, education, quorum, k12, enterprise, edu at line 5 column 24; content-type=application/json; body={
  "user_id": "user-xxxx",
  "account_id": "user-xxxx",
  "email": "user@example.test",
  "plan_type": "prolite",
  "rate_limit": {
    "allowed": true,
    "limit_reached": false,
    "primary_window": {
      "used_percent": 7,
      "limit_window_seconds": 18000,
      "reset_after_seconds": 3445,
      "reset_at": 1778653823
    },
    "secondary_window": {
      "used_percent": 16,
      "limit_window_seconds": 604800,
      "reset_after_seconds": 504330,
      "reset_at": 1779154708
    }
  },
  "additional_rate_limits": [
    {
      "limit_name": "GPT-5.3-Codex-Spark",
      "metered_feature": "codex_bengalfox",
      "rate_limit": {
        "allowed": true,
        "limit_reached": false,
        "primary_window": {
          "used_percent": 0,
          "limit_window_seconds": 18000,
          "reset_after_seconds": 18000,
          "reset_at": 1778668378
        },
        "secondary_window": {
          "used_percent": 0,
          "limit_window_seconds": 604800,
          "reset_after_seconds": 604800,
          "reset_at": 1779255178
        }
      }
    }
  ],
  "credits": {
    "has_credits": false,
    "unlimited": false,
    "balance": "0"
  },
  "rate_limit_reset_credits": {
    "available_count": 1,
    "credits": [{
      "id": "RateLimitResetCredit_1",
      "reset_type": "codexRateLimits",
      "status": "available",
      "granted_at": 1779000000,
      "expires_at": 1781000000,
      "title": "Full reset",
      "description": "Reset an eligible Codex rate-limit window."
    }]
  }
}`)

describe('recoverRateLimitsFromPlanTypeDecodeError', () => {
  it('rounds recovered second-based windows to integer minutes', () => {
    const recovered = recoverRateLimitsFromPlanTypeDecodeError(new Error(`failed to fetch codex rate limits: Decode error for https://chatgpt.com/backend-api/codex/quotas: unknown variant prolite at line 5 column 24; content-type=application/json; body={
      "plan_type": "prolite",
      "rate_limit": {
        "primary_window": {
          "used_percent": 10,
          "limit_window_seconds": 125,
          "reset_at": 1778653823
        }
      }
    }`))

    expect(recovered).toMatchObject({
      rateLimits: {
        primary: {
          windowDurationMins: 2,
          windowMinutes: 2,
        },
      },
    })
  })

  it('recovers quota payloads when Codex rejects a new ChatGPT plan type', () => {
    expect(recoverRateLimitsFromPlanTypeDecodeError(proliteDecodeError)).toEqual({
      rateLimits: {
        limitId: 'codex',
        limitName: null,
        primary: {
          usedPercent: 7,
          windowDurationMins: 300,
          windowMinutes: 300,
          resetsAt: 1778653823,
        },
        secondary: {
          usedPercent: 16,
          windowDurationMins: 10080,
          windowMinutes: 10080,
          resetsAt: 1779154708,
        },
        credits: {
          hasCredits: false,
          unlimited: false,
          balance: '0',
        },
        planType: 'prolite',
      },
      rateLimitsByLimitId: {
        codex: {
          limitId: 'codex',
          limitName: null,
          primary: {
            usedPercent: 7,
            windowDurationMins: 300,
            windowMinutes: 300,
            resetsAt: 1778653823,
          },
          secondary: {
            usedPercent: 16,
            windowDurationMins: 10080,
            windowMinutes: 10080,
            resetsAt: 1779154708,
          },
          credits: {
            hasCredits: false,
            unlimited: false,
            balance: '0',
          },
          planType: 'prolite',
        },
        codex_bengalfox: {
          limitId: 'codex_bengalfox',
          limitName: 'GPT-5.3-Codex-Spark',
          primary: {
            usedPercent: 0,
            windowDurationMins: 300,
            windowMinutes: 300,
            resetsAt: 1778668378,
          },
          secondary: {
            usedPercent: 0,
            windowDurationMins: 10080,
            windowMinutes: 10080,
            resetsAt: 1779255178,
          },
          credits: null,
          planType: 'prolite',
        },
      },
      rateLimitResetCredits: {
        available_count: 1,
        credits: [{
          id: 'RateLimitResetCredit_1',
          reset_type: 'codexRateLimits',
          status: 'available',
          granted_at: 1779000000,
          expires_at: 1781000000,
          title: 'Full reset',
          description: 'Reset an eligible Codex rate-limit window.',
        }],
      },
    })
  })

  it('does not recover unrelated errors', () => {
    expect(recoverRateLimitsFromPlanTypeDecodeError(new Error('failed to read rate limits'))).toBeNull()
  })
})

describe('callRpcWithRateLimitDecodeRecovery', () => {
  it('returns the recovered quota payload for account rate-limit decode errors', async () => {
    const calls: Array<{ method: string; params: unknown }> = []
    const appServer = {
      async rpc(method: string, params: unknown): Promise<unknown> {
        calls.push({ method, params })
        throw proliteDecodeError
      },
    }

    await expect(callRpcWithRateLimitDecodeRecovery(appServer, 'account/rateLimits/read', null)).resolves.toMatchObject({
      rateLimits: {
        planType: 'prolite',
      },
    })
    expect(calls).toEqual([{ method: 'account/rateLimits/read', params: null }])
  })

  it('rethrows errors from other RPC methods', async () => {
    const appServer = {
      async rpc(): Promise<unknown> {
        throw proliteDecodeError
      },
    }

    await expect(callRpcWithRateLimitDecodeRecovery(appServer, 'thread/read', {})).rejects.toThrow('unknown variant prolite')
  })
})
