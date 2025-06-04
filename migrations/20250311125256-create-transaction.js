'use strict';

// const PaymentStatus = require('../enums/paymentStatus');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('transactions', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.BIGINT
      },
      user_id: {
        type: Sequelize.BIGINT,
        references: {
          model: {
            tableName: 'users',
          },
          key: 'id',
        }
      },
      txHash: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      amount: {
        type: Sequelize.DECIMAL,
        allowNull: false
      },
      serviceBeneficiary: {
        type: Sequelize.STRING
      },
      date: {
        type: Sequelize.DATE,
        allowNull: false
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('transactions');
  }
};