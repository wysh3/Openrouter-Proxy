export default class ApiKey {
  constructor(data) {
    if (!data?.key) throw new Error('API key is required');
    
    this.key = data.key;
    this.isActive = data.isActive ?? true;
    this.lastUsed = data.lastUsed ? new Date(data.lastUsed) : null;
    this.failureCount = data.failureCount ?? 0;
    this.rateLimitResetAt = data.rateLimitResetAt ? new Date(data.rateLimitResetAt) : null;
    this._id = data._id || `key_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.quotaUsage = data.quotaUsage || {};
    this.lastQuotaCheck = data.lastQuotaCheck ? new Date(data.lastQuotaCheck) : null;
  }

  updateQuota(model, tokensUsed) {
    if (!this.quotaUsage[model]) {
      this.quotaUsage[model] = { used: 0, limit: Infinity };
    }
    this.quotaUsage[model].used += tokensUsed;
    this.lastQuotaCheck = new Date();
  }

  getRemainingQuota(model) {
    const quota = this.quotaUsage[model];
    if (!quota) return Infinity;
    
    // Reset quota if new day
    if (this.lastQuotaCheck &&
        new Date().getDate() !== this.lastQuotaCheck.getDate()) {
      quota.used = 0;
    }
    
    return Math.max(0, quota.limit - quota.used);
  }

  isRateLimited() {
    return this.rateLimitResetAt && this.rateLimitResetAt > new Date();
  }
}