export {
  getCompanyForUser,
  getUserWithCompany,
  getCompanyById,
} from "./company";

export {
  getScenarioForCompany,
  getDefaultScenario,
  getScenarioData,
  getScenarioDataWithValues,
} from "./scenario";

export {
  findByIdForCompany,
  updateForCompany,
  deleteForCompany,
  listForCompany,
} from "./crud";

export {
  getOverridesForScenario,
  upsertOverride,
  deleteOverride,
  deleteOverrideByEntity,
  getOverrideCount,
} from "./scenario-overrides";

export {
  resolveEntities,
  getResolvedData,
} from "./scenario-resolver";

export type { OverrideTag, ResolvedEntity } from "./scenario-resolver";

export {
  scenarioInsert,
  scenarioUpdate,
  scenarioDelete,
  planScenarioInsert,
  planScenarioUpdate,
  planScenarioDelete,
  commitScenarioPlan,
} from "./scenario-mutations";
export type { ScenarioPlan } from "./scenario-mutations";

export { promoteScenario } from "./scenario-promotion";

export { hasFinancialData } from "./company-financial-data";

export { SCENARIO_ENTITY_TYPES } from "./entity-types";
export type { ScenarioEntityType } from "./entity-types";

export {
  listSalaryChanges,
  listResolvedSalaryChanges,
  createSalaryChange,
  updateSalaryChange,
  removeSalaryChange,
} from "./salary-changes";
export type { SalaryChange, NewSalaryChange } from "./salary-changes";

export {
  listBonuses,
  listResolvedBonuses,
  createBonus,
  updateBonus,
  removeBonus,
} from "./bonuses";
export type { Bonus, NewBonus } from "./bonuses";

export {
  listEquityGrants,
  listResolvedEquityGrants,
  createEquityGrant,
  updateEquityGrant,
  removeEquityGrant,
} from "./equity-grants";
export type { EquityGrant, NewEquityGrant } from "./equity-grants";

export {
  listInvestorsForRound,
  listShareClasses,
  listOptionPools,
} from "./funding";

export {
  getPermissionDefaults,
  upsertPermissionDefaults,
  getSessionGrants,
  grantSessionPermission,
  resetSessionGrants,
  createPendingAction,
  getActivePendingAction,
  resolvePendingAction,
} from "./ai-permissions";
export type {
  PermissionModeValue,
  PermissionDefaultsPatch,
  NewPendingAction,
} from "./ai-permissions";
