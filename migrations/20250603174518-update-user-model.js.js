'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    /**
     * Add altering commands here.
     *
     * Example:
     * await queryInterface.createTable('users', { id: Sequelize.INTEGER });
     */

    

    await queryInterface.addColumn('users', 'bankCode',
      {
      type: Sequelize.STRING,
      allowNull: false
      });

    await queryInterface.addColumn('users', 'accountNumber', 
      {
        type: Sequelize.STRING,
        allowNull: false
      });
  },

  async down (queryInterface, Sequelize) {
    /**
     * Add reverting commands here.
     *
     * Example:
     * await queryInterface.dropTable('users');
     * 
     *
     */
    await queryInterface.removeColumn('users', 'bankCode');
    await queryInterface.removeColumn('users', 'accountNumber')
  }
};
