export interface MailRetentionCounts { cancelledDeliveries: number; purgedDeliveries: number }
export interface MailRetention { runBatch(limit: number): Promise<MailRetentionCounts> }
