import { DateTime } from 'luxon'

const testTime = DateTime.now()
const weekBeginning = DateTime.fromISO(testTime.minus({ days: testTime.weekday }).toISODate())
testTime.setZone("America/Los Angeles")

console.log(weekBeginning.toString())