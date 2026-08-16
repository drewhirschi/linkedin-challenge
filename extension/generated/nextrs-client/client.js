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
export const getGetMyCompetitionsUrl = () => {
    return `/api/me/competitions`;
};
export const getMyCompetitions = async (options) => {
    const res = await fetch(getGetMyCompetitionsUrl(), {
        ...options,
        method: 'GET'
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return { data, status: res.status, headers: res.headers };
};
export const getListOrgsUrl = () => {
    return `/api/orgs`;
};
export const listOrgs = async (options) => {
    const res = await fetch(getListOrgsUrl(), {
        ...options,
        method: 'GET'
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return { data, status: res.status, headers: res.headers };
};
export const getGetOrgUrl = (slug) => {
    return `/api/orgs/${slug}`;
};
export const getOrg = async (slug, options) => {
    const res = await fetch(getGetOrgUrl(slug), {
        ...options,
        method: 'GET'
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return { data, status: res.status, headers: res.headers };
};
export const getCreateCompetitionUrl = (slug) => {
    return `/api/orgs/${slug}/admin/competitions`;
};
export const createCompetition = async (slug, createCompetitionRequest, options) => {
    const res = await fetch(getCreateCompetitionUrl(slug), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...options?.headers },
        body: JSON.stringify(createCompetitionRequest)
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return { data, status: res.status, headers: res.headers };
};
export const getCreateInvitesUrl = (slug) => {
    return `/api/orgs/${slug}/admin/invites`;
};
export const createInvites = async (slug, createInvitesRequest, options) => {
    const res = await fetch(getCreateInvitesUrl(slug), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...options?.headers },
        body: JSON.stringify(createInvitesRequest)
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return { data, status: res.status, headers: res.headers };
};
export const getGetAdminOverviewUrl = (slug) => {
    return `/api/orgs/${slug}/admin/overview`;
};
export const getAdminOverview = async (slug, options) => {
    const res = await fetch(getGetAdminOverviewUrl(slug), {
        ...options,
        method: 'GET'
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return { data, status: res.status, headers: res.headers };
};
export const getGetCompetitionLeaderboardUrl = (slug, cid) => {
    return `/api/orgs/${slug}/competitions/${cid}`;
};
export const getCompetitionLeaderboard = async (slug, cid, options) => {
    const res = await fetch(getGetCompetitionLeaderboardUrl(slug, cid), {
        ...options,
        method: 'GET'
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return { data, status: res.status, headers: res.headers };
};
export const getGetCompetitionAggregateUrl = (slug, cid) => {
    return `/api/orgs/${slug}/competitions/${cid}/aggregate`;
};
export const getCompetitionAggregate = async (slug, cid, options) => {
    const res = await fetch(getGetCompetitionAggregateUrl(slug, cid), {
        ...options,
        method: 'GET'
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return { data, status: res.status, headers: res.headers };
};
export const getGetMemberDetailUrl = (slug, cid, id) => {
    return `/api/orgs/${slug}/competitions/${cid}/members/${id}`;
};
export const getMemberDetail = async (slug, cid, id, options) => {
    const res = await fetch(getGetMemberDetailUrl(slug, cid, id), {
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
