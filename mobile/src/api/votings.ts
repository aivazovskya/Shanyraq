import { apiClient } from './client';

import { normalizeMeeting, normalizeVoteReceipt, type MeetingResponse, type CastVoteResponse } from './voting-response';

export type VoteChoice = 'FOR' | 'AGAINST' | 'ABSTAIN';

export interface AgendaItem {
  id: string;
  orderNum: number;
  title: string;
  description?: string;
  decisionType: 'SIMPLE_MAJORITY' | 'QUALIFIED_MAJORITY';
  votesSummary?: {
    forArea: number;
    againstArea: number;
    abstainArea: number;
    forPercent: number;
    againstPercent: number;
    abstainPercent: number;
  };
  myVote?: {
    choice: VoteChoice;
    votedAt: string;
    areaWeight: number;
    signatureHash: string;
  } | null;
}

export interface MeetingItem {
  id: string;
  tenantId: string;
  title: string;
  description?: string;
  status: 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  startDate: string;
  endDate: string;
  totalTenantArea: number;
  participatedArea: number;
  quorumPercent: number;
  isQuorumReached: boolean;
  agendaItems: AgendaItem[];
  _count?: {
    agendaItems: number;
  };
}

export interface CastVoteDto {
  agendaItemId: string;
  unitId: string;
  choice: VoteChoice;
  otpCode: string;
}

export const VotingsApi = {
  async getMeetings(tenantId: string): Promise<MeetingItem[]> {
    const res = await apiClient.get<MeetingResponse[]>(`/votings/tenant/${tenantId}`);
    return res.data.map(normalizeMeeting);
  },

  async getMeetingDetails(meetingId: string): Promise<MeetingItem> {
    const res = await apiClient.get<MeetingResponse>(`/votings/${meetingId}`);
    return normalizeMeeting(res.data);
  },

  async castVote(dto: CastVoteDto) {
    const res = await apiClient.post<CastVoteResponse>('/votings/vote', dto);
    return normalizeVoteReceipt(res.data);
  },
};
