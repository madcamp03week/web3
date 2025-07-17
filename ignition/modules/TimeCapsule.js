const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

module.exports = buildModule("TimeCapsule", (m) => {
  const timeCapsule = m.contract("TimeCapsule", [m.deployer]);

  return { timeCapsule };
}); 