import type { MeetingItem, VoteChoice } from './votings';

export interface MeetingResponse {
  id: string; tenantId: string; title: string; description?: string | null;
  status: MeetingItem['status']; startDate: string; endDate: string;
  quorum: { totalEligibleArea: number; totalVotedArea: number; quorumPercent: number; isQuorumAchieved: boolean };
  agendaItems: {
    id: string; orderIndex: number; question: string; description?: string | null;
    decisionType: 'SIMPLE_MAJORITY' | 'QUALIFIED_MAJORITY';
    results?: { areaFor: number; areaAgainst: number; areaAbstain: number; totalItemVotedArea: number; forPercentFromVoted: number };
    myVote?: { choice: VoteChoice; areaWeight: number; voteHash: string; createdAt: string } | null;
  }[];
}

/** Adapt the backend response once, keeping all resident screens on one model. */
export function normalizeMeeting(data: MeetingResponse): MeetingItem {
  return {
    id: data.id, tenantId: data.tenantId, title: data.title, description: data.description || undefined,
    status: data.status, startDate: data.startDate, endDate: data.endDate,
    totalTenantArea: data.quorum.totalEligibleArea,
    participatedArea: data.quorum.totalVotedArea,
    quorumPercent: data.quorum.quorumPercent,
    isQuorumReached: data.quorum.isQuorumAchieved,
    agendaItems: data.agendaItems.map((item) => ({
      id: item.id, orderNum: item.orderIndex, title: item.question, description: item.description || undefined,
      decisionType: item.decisionType,
      votesSummary: item.results ? {
        forArea: item.results.areaFor, againstArea: item.results.areaAgainst, abstainArea: item.results.areaAbstain,
        forPercent: item.results.forPercentFromVoted,
        againstPercent: item.results.totalItemVotedArea > 0 ? item.results.areaAgainst / item.results.totalItemVotedArea * 100 : 0,
        abstainPercent: item.results.totalItemVotedArea > 0 ? item.results.areaAbstain / item.results.totalItemVotedArea * 100 : 0,
      } : undefined,
      myVote: item.myVote ? {
        choice: item.myVote.choice, areaWeight: item.myVote.areaWeight,
        signatureHash: item.myVote.voteHash, votedAt: item.myVote.createdAt,
      } : null,
    })),
  };
}

export interface CastVoteResponse { success: boolean; message: string; vote: { voteHash: string; areaWeight: number; createdAt: string } }
export function normalizeVoteReceipt(data: CastVoteResponse) {
  return { success: data.success, message: data.message, signatureHash: data.vote.voteHash, areaWeight: data.vote.areaWeight, votedAt: data.vote.createdAt };
}
