/** @typedef {{uuid:string,title:string,status:"scheduled"|"active"|"ended",scheduled_at?:string|null,started_at?:string|null,ended_at?:string|null,max_participants:number,creator?:{id:number,name:string},participant_count?:number,joined_count?:number,is_host?:boolean}} Meeting */
/** @typedef {{url:string,token:string,room:string,identity:string,expires_in:number,media_defaults?:object}} MeetingConnectionDetails */

export {};

