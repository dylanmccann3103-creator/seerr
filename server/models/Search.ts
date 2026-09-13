// Result shapes live in models/{Scene,Site,Performer}.ts; this union is the
// discriminator the frontend cards switch on.
export type MediaType = 'scene' | 'site' | 'performer';
