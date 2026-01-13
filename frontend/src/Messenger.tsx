import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api from "./api";
import { getErrorMessage } from "./utils/errors";
import {
  Alert,
  Avatar,
  Box,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import {
  ArrowBackRounded,
  CampaignRounded,
  RefreshRounded,
  SearchRounded,
  SendRounded,
} from "@mui/icons-material";

type MeResponse = {
  user: {
    id: number | string;
    name?: string;
    email?: string;
    role?: string;
    tenant_id?: number | string | null;
    employee_id?: number | string | null;
  };
  employee: { id: string; name: string } | null;
};

type Person = {
  id: number | string;
  name: string;
  code?: string;
  designation?: string | null;
  department?: string | null;
  profile_photo_path?: string | null;
  status?: string;
};

type Conversation = {
  id: number | string;
  kind: string;
  conversation_key?: string;
  direct_employee_a?: number | string | null;
  direct_employee_b?: number | string | null;
  direct_user_id?: number | string | null;
  direct_employee_id?: number | string | null;
  updated_at?: string;
  a_name?: string | null;
  a_code?: string | null;
  a_photo?: string | null;
  b_name?: string | null;
  b_code?: string | null;
  b_photo?: string | null;
  owner_name?: string | null;
  owner_employee_name?: string | null;
  owner_employee_code?: string | null;
  owner_employee_photo?: string | null;
};

type Message = {
  id: number | string;
  sender_user_id?: number | string | null;
  sender_employee_id?: number | string | null;
  sender_name: string;
  sender_role: string;
  body: string;
  created_at: string;
};

function safeId(v: number | string | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  return s.trim();
}

function formatTimeLabel(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

export default function Messenger() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [me, setMe] = useState<MeResponse | null>(null);

  const [tab, setTab] = useState<"chats" | "people">("chats");
  const [people, setPeople] = useState<Person[]>([]);
  const [peopleQuery, setPeopleQuery] = useState("");
  const [peopleLoading, setPeopleLoading] = useState(false);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(false);

  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [sendBusy, setSendBusy] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  const myRole = String(me?.user?.role || "");
  const myEmployeeId = useMemo(() => {
    const raw = me?.employee?.id || me?.user?.employee_id;
    return safeId(raw);
  }, [me]);

  const selectedConversation = useMemo(() => {
    return conversations.find((c) => safeId(c.id) === selectedConversationId);
  }, [conversations, selectedConversationId]);

  const isAnnouncements =
    String(selectedConversation?.kind || "") === "announcements";

  const canSendInSelected = useMemo(() => {
    if (!selectedConversationId) return false;
    if (isAnnouncements) return myRole === "tenant_owner";
    return true;
  }, [isAnnouncements, myRole, selectedConversationId]);

  const headerLabel = useMemo(() => {
    if (!selectedConversation) return "Select a chat";
    if (selectedConversation.kind === "announcements") return "Announcements";
    if (selectedConversation.kind === "owner_direct") {
      const owner = String(selectedConversation.owner_name || "Tenant Owner");
      const emp = String(
        selectedConversation.owner_employee_name || "Employee"
      ).trim();
      if (myRole === "tenant_owner") return emp || "Employee";
      return owner.trim() || "Tenant Owner";
    }
    const aName = String(selectedConversation.a_name || "").trim();
    const bName = String(selectedConversation.b_name || "").trim();
    if (myRole === "tenant_owner") {
      const left = aName || "Employee";
      const right = bName || "Employee";
      return `${left} ↔ ${right}`;
    }
    const aId = safeId(selectedConversation.direct_employee_a);
    const bId = safeId(selectedConversation.direct_employee_b);
    if (myEmployeeId && aId === myEmployeeId) return bName || "Employee";
    if (myEmployeeId && bId === myEmployeeId) return aName || "Employee";
    return aName || bName || "Chat";
  }, [myEmployeeId, myRole, selectedConversation]);

  const fetchMe = useCallback(async () => {
    const res = await api.get("/api/me");
    setMe(res.data as MeResponse);
  }, []);

  const fetchPeople = useCallback(async () => {
    setPeopleLoading(true);
    try {
      const res = await api.get("/api/messenger/people");
      setPeople(
        Array.isArray(res.data?.people) ? (res.data.people as Person[]) : []
      );
    } catch (err: unknown) {
      setPeople([]);
      setError(getErrorMessage(err, "Failed to load people"));
    } finally {
      setPeopleLoading(false);
    }
  }, []);

  const fetchConversations = useCallback(async () => {
    setConversationsLoading(true);
    try {
      const res = await api.get("/api/messenger/conversations");
      setConversations(
        Array.isArray(res.data?.conversations)
          ? (res.data.conversations as Conversation[])
          : []
      );
    } catch (err: unknown) {
      setConversations([]);
      setError(getErrorMessage(err, "Failed to load conversations"));
    } finally {
      setConversationsLoading(false);
    }
  }, []);

  const fetchMessages = useCallback(async (conversationId: string) => {
    if (!conversationId) return;
    setMessagesLoading(true);
    try {
      const res = await api.get(
        `/api/messenger/messages?conversation_id=${encodeURIComponent(
          conversationId
        )}&limit=80`
      );
      setMessages(
        Array.isArray(res.data?.messages)
          ? (res.data.messages as Message[])
          : []
      );
    } catch (err: unknown) {
      setMessages([]);
      setError(getErrorMessage(err, "Failed to load messages"));
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    setError("");
    void (async () => {
      try {
        await fetchMe();
        await Promise.all([fetchPeople(), fetchConversations()]);
      } catch (err: unknown) {
        setError(getErrorMessage(err, "Failed to load messenger"));
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchConversations, fetchMe, fetchPeople]);

  useEffect(() => {
    if (!selectedConversationId) return;
    void fetchMessages(selectedConversationId);
  }, [fetchMessages, selectedConversationId]);

  useEffect(() => {
    if (!selectedConversationId) return;
    const t = window.setInterval(() => {
      if (sendBusy) return;
      void fetchMessages(selectedConversationId);
    }, 5000);
    return () => window.clearInterval(t);
  }, [fetchMessages, selectedConversationId, sendBusy]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messagesLoading, selectedConversationId]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const filteredPeople = useMemo(() => {
    const q = peopleQuery.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) => {
      const name = String(p.name || "").toLowerCase();
      const code = String(p.code || "").toLowerCase();
      const dept = String(p.department || "").toLowerCase();
      const desig = String(p.designation || "").toLowerCase();
      return (
        name.includes(q) ||
        code.includes(q) ||
        dept.includes(q) ||
        desig.includes(q)
      );
    });
  }, [people, peopleQuery]);

  const startDirectChat = useCallback(
    async (employeeId: string) => {
      if (!employeeId) return;
      if (!myEmployeeId && myRole !== "tenant_owner") {
        setError("Employee account is not linked to an employee record.");
        return;
      }
      const otherId = Number(employeeId);
      if (!Number.isFinite(otherId) || otherId <= 0) {
        setError("Invalid employee.");
        return;
      }
      try {
        const res = await api.post(
          "/api/messenger/conversations/direct",
          { employee_id: otherId },
          { headers: { "X-Toast-Skip": "1" } }
        );
        const conv = res.data?.conversation as Conversation | undefined;
        const cid = safeId(conv?.id);
        await fetchConversations();
        if (cid) setSelectedConversationId(cid);
        if (isMobile) setTab("chats");
      } catch (err: unknown) {
        setError(getErrorMessage(err, "Failed to start chat"));
      }
    },
    [fetchConversations, isMobile, myEmployeeId, myRole]
  );

  const send = useCallback(async () => {
    const body = draft.trim();
    if (!selectedConversationId || !body) return;
    if (!canSendInSelected) return;
    const conversationIdNum = Number(selectedConversationId);
    if (!Number.isFinite(conversationIdNum) || conversationIdNum <= 0) return;
    setSendBusy(true);
    try {
      await api.post(
        "/api/messenger/messages/send",
        { conversation_id: conversationIdNum, body },
        { headers: { "X-Toast-Skip": "1" } }
      );
      setDraft("");
      await Promise.all([
        fetchMessages(selectedConversationId),
        fetchConversations(),
      ]);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to send message"));
    } finally {
      setSendBusy(false);
    }
  }, [
    canSendInSelected,
    draft,
    fetchConversations,
    fetchMessages,
    selectedConversationId,
  ]);

  const openAnnouncements = useCallback(() => {
    const ann = conversations.find(
      (c) => String(c.kind || "") === "announcements"
    );
    if (ann) setSelectedConversationId(safeId(ann.id));
  }, [conversations]);

  const sidebar = (
    <Paper
      variant="outlined"
      sx={{
        borderRadius: 3,
        overflow: "hidden",
        height: isMobile ? "auto" : "calc(100vh - 220px)",
        minHeight: isMobile ? 0 : 520,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Box sx={{ px: 2, pt: 2, pb: 1.25 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography sx={{ fontWeight: 900, flex: 1 }}>Messenger</Typography>
          <IconButton
            size="small"
            onClick={() => {
              setError("");
              void Promise.all([fetchPeople(), fetchConversations()]);
            }}
            aria-label="Refresh"
          >
            <RefreshRounded fontSize="small" />
          </IconButton>
        </Stack>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{
            mt: 1,
            minHeight: 42,
            "& .MuiTab-root": { minHeight: 42, fontWeight: 800 },
          }}
        >
          <Tab value="chats" label="Chats" />
          <Tab value="people" label="People" />
        </Tabs>
      </Box>
      <Divider />
      <Box sx={{ p: 1.5, overflow: "auto", flex: 1 }}>
        {tab === "people" ? (
          <Stack spacing={1.25}>
            <TextField
              value={peopleQuery}
              onChange={(e) => setPeopleQuery(e.target.value)}
              placeholder="Search people"
              size="small"
              fullWidth
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchRounded fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
            {peopleLoading ? (
              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                sx={{ px: 1, py: 1.25 }}
              >
                <CircularProgress size={18} />
                <Typography color="text.secondary">Loading…</Typography>
              </Stack>
            ) : (
              <Stack spacing={0.75}>
                {filteredPeople.map((p) => {
                  const pid = safeId(p.id);
                  const disabled =
                    myRole !== "tenant_owner" && pid === myEmployeeId;
                  return (
                    <Button
                      key={pid}
                      variant="text"
                      onClick={() => void startDirectChat(pid)}
                      disabled={!pid || disabled}
                      sx={{
                        justifyContent: "flex-start",
                        textTransform: "none",
                        borderRadius: 2,
                        py: 1,
                        px: 1,
                        gap: 1.25,
                      }}
                    >
                      <Avatar sx={{ width: 34, height: 34 }}>
                        {String(p.name || "E")
                          .trim()
                          .slice(0, 1)
                          .toUpperCase()}
                      </Avatar>
                      <Box sx={{ minWidth: 0, textAlign: "left", flex: 1 }}>
                        <Typography sx={{ fontWeight: 800 }} noWrap>
                          {p.name}
                        </Typography>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          noWrap
                        >
                          {[p.designation, p.department, p.code]
                            .map((v) => String(v || "").trim())
                            .filter(Boolean)
                            .join(" • ") || "—"}
                        </Typography>
                      </Box>
                    </Button>
                  );
                })}
                {!filteredPeople.length ? (
                  <Typography color="text.secondary" sx={{ px: 1, py: 1.25 }}>
                    No people found.
                  </Typography>
                ) : null}
              </Stack>
            )}
          </Stack>
        ) : (
          <Stack spacing={0.75}>
            {conversationsLoading ? (
              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                sx={{ px: 1, py: 1.25 }}
              >
                <CircularProgress size={18} />
                <Typography color="text.secondary">Loading…</Typography>
              </Stack>
            ) : (
              <>
                {myRole === "tenant_owner" ? (
                  <Button
                    onClick={openAnnouncements}
                    variant="outlined"
                    startIcon={<CampaignRounded />}
                    sx={{
                      borderRadius: 2,
                      fontWeight: 800,
                      textTransform: "none",
                    }}
                  >
                    Broadcast (Announcements)
                  </Button>
                ) : null}
                {conversations.map((c) => {
                  const cid = safeId(c.id);
                  const selected = cid && cid === selectedConversationId;
                  const isAnn = String(c.kind || "") === "announcements";
                  const isOwner = String(c.kind || "") === "owner_direct";
                  const aName = String(c.a_name || "").trim();
                  const bName = String(c.b_name || "").trim();
                  const ownerName = String(
                    c.owner_name || "Tenant Owner"
                  ).trim();
                  const ownerEmpName = String(
                    c.owner_employee_name || "Employee"
                  ).trim();
                  const label = isAnn
                    ? "Announcements"
                    : isOwner
                    ? myRole === "tenant_owner"
                      ? ownerEmpName || "Employee"
                      : ownerName || "Tenant Owner"
                    : myRole === "tenant_owner"
                    ? `${aName || "Employee"} ↔ ${bName || "Employee"}`
                    : (() => {
                        const aId = safeId(c.direct_employee_a);
                        const bId = safeId(c.direct_employee_b);
                        if (myEmployeeId && aId === myEmployeeId)
                          return bName || "Employee";
                        if (myEmployeeId && bId === myEmployeeId)
                          return aName || "Employee";
                        return aName || bName || "Chat";
                      })();
                  return (
                    <Button
                      key={cid}
                      onClick={() => setSelectedConversationId(cid)}
                      variant={selected ? "contained" : "text"}
                      sx={{
                        justifyContent: "flex-start",
                        textTransform: "none",
                        borderRadius: 2,
                        py: 1,
                        px: 1.25,
                        gap: 1.25,
                        bgcolor: selected ? "primary.main" : "transparent",
                        color: selected
                          ? "primary.contrastText"
                          : "text.primary",
                        "&:hover": {
                          bgcolor: selected ? "primary.dark" : "action.hover",
                        },
                      }}
                    >
                      <Avatar
                        sx={{
                          width: 34,
                          height: 34,
                          bgcolor: isAnn ? "warning.main" : "primary.main",
                        }}
                      >
                        {isAnn ? (
                          <CampaignRounded fontSize="small" />
                        ) : (
                          label.slice(0, 1).toUpperCase()
                        )}
                      </Avatar>
                      <Box sx={{ minWidth: 0, textAlign: "left", flex: 1 }}>
                        <Typography sx={{ fontWeight: 800 }} noWrap>
                          {label}
                        </Typography>
                        <Typography
                          variant="body2"
                          color={
                            selected ? "primary.contrastText" : "text.secondary"
                          }
                          noWrap
                        >
                          {c.updated_at
                            ? formatTimeLabel(String(c.updated_at))
                            : " "}
                        </Typography>
                      </Box>
                    </Button>
                  );
                })}
                {!conversations.length ? (
                  <Typography color="text.secondary" sx={{ px: 1, py: 1.25 }}>
                    No conversations yet.
                  </Typography>
                ) : null}
              </>
            )}
          </Stack>
        )}
      </Box>
    </Paper>
  );

  const chatPane = (
    <Paper
      variant="outlined"
      sx={{
        borderRadius: 3,
        overflow: "hidden",
        height: isMobile ? "calc(100vh - 220px)" : "calc(100vh - 220px)",
        minHeight: 520,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Box
        sx={{ px: 2, py: 1.5, display: "flex", alignItems: "center", gap: 1 }}
      >
        {isMobile ? (
          <IconButton
            size="small"
            onClick={() => setSelectedConversationId("")}
            disabled={!selectedConversationId}
            aria-label="Back"
          >
            <ArrowBackRounded fontSize="small" />
          </IconButton>
        ) : null}
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontWeight: 900 }} noWrap>
            {headerLabel}
          </Typography>
          {selectedConversationId ? (
            <Typography variant="body2" color="text.secondary" noWrap>
              {isAnnouncements
                ? "Visible to everyone in this tenant"
                : "Private chat"}
            </Typography>
          ) : (
            <Typography variant="body2" color="text.secondary" noWrap>
              Choose a chat from the left.
            </Typography>
          )}
        </Box>
        <IconButton
          size="small"
          onClick={() =>
            selectedConversationId && void fetchMessages(selectedConversationId)
          }
          disabled={!selectedConversationId || messagesLoading}
          aria-label="Refresh messages"
        >
          <RefreshRounded fontSize="small" />
        </IconButton>
      </Box>
      <Divider />
      <Box
        ref={scrollRef}
        sx={{
          p: 2,
          flex: 1,
          overflow: "auto",
          bgcolor: "background.default",
        }}
      >
        {!selectedConversationId ? (
          <Stack
            spacing={1}
            alignItems="center"
            justifyContent="center"
            sx={{ py: 8 }}
          >
            <Typography color="text.secondary">No chat selected.</Typography>
          </Stack>
        ) : messagesLoading ? (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 2 }}>
            <CircularProgress size={18} />
            <Typography color="text.secondary">Loading messages…</Typography>
          </Stack>
        ) : (
          <Stack spacing={1.25}>
            {messages.map((m) => {
              const id = safeId(m.id);
              const mine =
                safeId(m.sender_user_id) === safeId(me?.user?.id) ||
                (myEmployeeId && safeId(m.sender_employee_id) === myEmployeeId);
              return (
                <Box
                  key={id}
                  sx={{
                    display: "flex",
                    justifyContent: mine ? "flex-end" : "flex-start",
                  }}
                >
                  <Paper
                    elevation={0}
                    sx={{
                      px: 1.5,
                      py: 1.1,
                      borderRadius: 2.5,
                      maxWidth: "min(680px, 100%)",
                      bgcolor: mine ? "primary.main" : "background.paper",
                      color: mine ? "primary.contrastText" : "text.primary",
                      border: "1px solid",
                      borderColor: mine ? "transparent" : "divider",
                    }}
                  >
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: 800, opacity: mine ? 0.9 : 1 }}
                    >
                      {m.sender_name}
                    </Typography>
                    <Typography sx={{ whiteSpace: "pre-wrap" }}>
                      {m.body}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        display: "block",
                        mt: 0.5,
                        opacity: mine ? 0.85 : 0.7,
                      }}
                    >
                      {formatTimeLabel(m.created_at)}
                    </Typography>
                  </Paper>
                </Box>
              );
            })}
            {!messages.length ? (
              <Typography color="text.secondary">No messages yet.</Typography>
            ) : null}
          </Stack>
        )}
      </Box>
      <Divider />
      <Box sx={{ p: 2 }}>
        <Stack direction="row" spacing={1.25} alignItems="flex-end">
          <TextField
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              !selectedConversationId
                ? "Select a chat to type…"
                : canSendInSelected
                ? "Type a message…"
                : "Only the tenant owner can post here."
            }
            multiline
            minRows={1}
            maxRows={4}
            fullWidth
            disabled={!selectedConversationId || !canSendInSelected || sendBusy}
            onKeyDown={(e) => {
              if (!selectedConversationId) return;
              if (!canSendInSelected) return;
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <Button
            variant="contained"
            onClick={() => void send()}
            disabled={
              !selectedConversationId ||
              !canSendInSelected ||
              sendBusy ||
              !draft.trim()
            }
            endIcon={<SendRounded />}
            sx={{ borderRadius: 2, fontWeight: 900 }}
          >
            Send
          </Button>
        </Stack>
      </Box>
    </Paper>
  );

  if (loading) {
    return (
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{ px: 2, py: 3 }}
      >
        <CircularProgress size={18} />
        <Typography color="text.secondary">Loading messenger…</Typography>
      </Stack>
    );
  }

  return (
    <Stack spacing={2.5}>
      {error ? (
        <Alert
          severity="error"
          onClose={() => setError("")}
          sx={{ borderRadius: 2 }}
        >
          {error}
        </Alert>
      ) : null}

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: isMobile
            ? "1fr"
            : "minmax(280px, 340px) minmax(0, 1fr)",
          gap: 2,
          alignItems: "start",
        }}
      >
        {isMobile ? (
          selectedConversationId ? (
            chatPane
          ) : (
            sidebar
          )
        ) : (
          <>
            {sidebar}
            {chatPane}
          </>
        )}
      </Box>
    </Stack>
  );
}
