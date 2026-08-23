export const getGetChallengeAggregateUrl = (params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? 'null' : value.toString());
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0 ? `/api/admin/aggregate?${stringifiedParams}` : `/api/admin/aggregate`;
};
export const getChallengeAggregate = async (params, options) => {
    const res = await fetch(getGetChallengeAggregateUrl(params), {
        ...options,
        method: 'GET'
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return { data, status: res.status, headers: res.headers };
};
export const getGetAdminOverviewUrl = () => {
    return `/api/admin/overview`;
};
export const getAdminOverview = async (options) => {
    const res = await fetch(getGetAdminOverviewUrl(), {
        ...options,
        method: 'GET'
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return { data, status: res.status, headers: res.headers };
};
export const getSignInDeviceWithSessionUrl = () => {
    return `/api/auth/device/session`;
};
export const signInDeviceWithSession = async (sessionDeviceRequest, options) => {
    const res = await fetch(getSignInDeviceWithSessionUrl(), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...options?.headers },
        body: JSON.stringify(sessionDeviceRequest)
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return { data, status: res.status, headers: res.headers };
};
export const getJoinWithInviteUrl = () => {
    return `/api/auth/join`;
};
export const joinWithInvite = async (joinRequest, options) => {
    const res = await fetch(getJoinWithInviteUrl(), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...options?.headers },
        body: JSON.stringify(joinRequest)
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return { data, status: res.status, headers: res.headers };
};
export const getLoginUrl = () => {
    return `/api/auth/login`;
};
export const login = async (loginRequest, options) => {
    const res = await fetch(getLoginUrl(), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...options?.headers },
        body: JSON.stringify(loginRequest)
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return { data, status: res.status, headers: res.headers };
};
;
export const getLogoutUrl = () => {
    return `/api/auth/logout`;
};
export const logout = async (options) => {
    const res = await fetch(getLogoutUrl(), {
        ...options,
        method: 'POST'
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return { data, status: res.status, headers: res.headers };
};
export const getGetMeUrl = () => {
    return `/api/auth/me`;
};
export const getMe = async (options) => {
    const res = await fetch(getGetMeUrl(), {
        ...options,
        method: 'GET'
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return { data, status: res.status, headers: res.headers };
};
export const getSignupUrl = () => {
    return `/api/auth/signup`;
};
export const signup = async (signupRequest, options) => {
    const res = await fetch(getSignupUrl(), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...options?.headers },
        body: JSON.stringify(signupRequest)
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return { data, status: res.status, headers: res.headers };
};
export const getGetChallengesUrl = () => {
    return `/api/challenges`;
};
export const getChallenges = async (options) => {
    const res = await fetch(getGetChallengesUrl(), {
        ...options,
        method: 'GET'
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return { data, status: res.status, headers: res.headers };
};
export const getCreateChallengeUrl = () => {
    return `/api/challenges`;
};
export const createChallenge = async (createChallengeRequest, options) => {
    const res = await fetch(getCreateChallengeUrl(), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...options?.headers },
        body: JSON.stringify(createChallengeRequest)
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return { data, status: res.status, headers: res.headers };
};
export const getSetChallengeFavoriteUrl = (id) => {
    return `/api/challenges/${id}/favorite`;
};
export const setChallengeFavorite = async (id, favoriteChallengeRequest, options) => {
    const res = await fetch(getSetChallengeFavoriteUrl(id), {
        ...options,
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...options?.headers },
        body: JSON.stringify(favoriteChallengeRequest)
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return { data, status: res.status, headers: res.headers };
};
export const getGetChallengeInvitesUrl = (id) => {
    return `/api/challenges/${id}/invites`;
};
export const getChallengeInvites = async (id, options) => {
    const res = await fetch(getGetChallengeInvitesUrl(id), {
        ...options,
        method: 'GET'
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return { data, status: res.status, headers: res.headers };
};
export const getCreateInvitesUrl = (id) => {
    return `/api/challenges/${id}/invites`;
};
export const createInvites = async (id, createInvitesRequest, options) => {
    const res = await fetch(getCreateInvitesUrl(id), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...options?.headers },
        body: JSON.stringify(createInvitesRequest)
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return { data, status: res.status, headers: res.headers };
};
;
export const getHealthUrl = () => {
    return `/api/health`;
};
export const health = async (options) => {
    const res = await fetch(getHealthUrl(), {
        ...options,
        method: 'GET'
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return { data, status: res.status, headers: res.headers };
};
export const getAcceptChallengeInviteUrl = (code) => {
    return `/api/invites/${code}/accept`;
};
export const acceptChallengeInvite = async (code, options) => {
    const res = await fetch(getAcceptChallengeInviteUrl(code), {
        ...options,
        method: 'POST'
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return { data, status: res.status, headers: res.headers };
};
export const getGetLeaderboardUrl = (params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? 'null' : value.toString());
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0 ? `/api/leaderboard?${stringifiedParams}` : `/api/leaderboard`;
};
export const getLeaderboard = async (params, options) => {
    const res = await fetch(getGetLeaderboardUrl(params), {
        ...options,
        method: 'GET'
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return { data, status: res.status, headers: res.headers };
};
export const getLinkIdentityUrl = () => {
    return `/api/link`;
};
export const linkIdentity = async (linkRequest, options) => {
    const res = await fetch(getLinkIdentityUrl(), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...options?.headers },
        body: JSON.stringify(linkRequest)
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return { data, status: res.status, headers: res.headers };
};
export const getGetMyInvitesUrl = () => {
    return `/api/me/invites`;
};
export const getMyInvites = async (options) => {
    const res = await fetch(getGetMyInvitesUrl(), {
        ...options,
        method: 'GET'
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return { data, status: res.status, headers: res.headers };
};
export const getGetMyPostsUrl = (params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? 'null' : value.toString());
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0 ? `/api/me/posts?${stringifiedParams}` : `/api/me/posts`;
};
export const getMyPosts = async (params, options) => {
    const res = await fetch(getGetMyPostsUrl(params), {
        ...options,
        method: 'GET'
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return { data, status: res.status, headers: res.headers };
};
export const getGetMemberDetailUrl = (id, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? 'null' : value.toString());
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0 ? `/api/members/${id}?${stringifiedParams}` : `/api/members/${id}`;
};
export const getMemberDetail = async (id, params, options) => {
    const res = await fetch(getGetMemberDetailUrl(id, params), {
        ...options,
        method: 'GET'
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return { data, status: res.status, headers: res.headers };
};
export const getPushSyncUrl = () => {
    return `/api/sync`;
};
export const pushSync = async (syncRequest, options) => {
    const res = await fetch(getPushSyncUrl(), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...options?.headers },
        body: JSON.stringify(syncRequest)
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return { data, status: res.status, headers: res.headers };
};
export const getImpersonateUrl = () => {
    return `/api/system/impersonate`;
};
export const impersonate = async (impersonateRequest, options) => {
    const res = await fetch(getImpersonateUrl(), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...options?.headers },
        body: JSON.stringify(impersonateRequest)
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return { data, status: res.status, headers: res.headers };
};
export const getStopImpersonationUrl = () => {
    return `/api/system/impersonate/stop`;
};
export const stopImpersonation = async (options) => {
    const res = await fetch(getStopImpersonationUrl(), {
        ...options,
        method: 'POST'
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return { data, status: res.status, headers: res.headers };
};
export const getGetSystemOverviewUrl = () => {
    return `/api/system/overview`;
};
export const getSystemOverview = async (options) => {
    const res = await fetch(getGetSystemOverviewUrl(), {
        ...options,
        method: 'GET'
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return { data, status: res.status, headers: res.headers };
};
