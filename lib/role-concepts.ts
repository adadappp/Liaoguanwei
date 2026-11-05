// 仅登记有依据的名称对应；宽泛岗位必须再由正文证明专项职责。
// Foley Artist / 拟音师：广电总局《广播电视和网络视听节目对外译制规范》术语表。
export function roleConcept(role:string) {
  if(/拟音|(?:^|[^a-z])foley(?:$|[^a-z])/i.test(role))return {
    id:"foley",
    searchTerms:["拟音师 Foley", "拟音师", '音效设计师 "Foley"'],
    directTitle:/拟音|(?:^|[^a-z])foley(?:$|[^a-z])/i,
    relatedTitle:/音效师|声音设计|音效设计|声音编辑|音效编辑|音频制作|声音制作|sound\s*designer|audio\s*designer/i,
    specialty:/拟音|(?:^|[^a-z])foley(?:$|[^a-z])/i,
    excludedTitle:/配音|主播|销售|讲师|教师|算法|软件开发|插件开发/i,
  };
  return null;
}
export function conceptRoleMatch(role:string,title:string,body:string):boolean|null {
  const concept=roleConcept(role);if(!concept)return null;
  if(concept.excludedTitle.test(title))return false;
  return concept.directTitle.test(title) || (concept.relatedTitle.test(title)&&concept.specialty.test(body));
}
