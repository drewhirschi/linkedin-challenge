export const getCreateCompetitionUrl = () => {
    return `/api/admin/competitions`;
};
export const createCompetition = async (createCompetitionRequest, options) => {
    const res = await fetch(getCreateCompetitionUrl(), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...options?.headers },
        body: JSON.stringify(createCompetitionRequest)
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return { data, status: res.status, headers: res.headers };
};
export const getCreateInvitesUrl = () => {
    return `/api/admin/invites`;
};
export const createInvites = async (createInvitesRequest, options) => {
    const res = await fetch(getCreateInvitesUrl(), {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...options?.headers },
        body: JSON.stringify(createInvitesRequest)
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
;
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
;
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
export const getGetLeaderboardUrl = (slug) => {
    return `/api/orgs/${slug}`;
};
export const getLeaderboard = async (slug, options) => {
    const res = await fetch(getGetLeaderboardUrl(slug), {
        ...options,
        method: 'GET'
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return { data, status: res.status, headers: res.headers };
};
export const getGetMemberDetailUrl = (slug, id) => {
    return `/api/orgs/${slug}/members/${id}`;
};
export const getMemberDetail = async (slug, id, options) => {
    const res = await fetch(getGetMemberDetailUrl(slug, id), {
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
