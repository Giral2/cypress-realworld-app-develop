describe("Flujo 2: Gestión de Cuentas Bancarias", () => {
  const apiGraphQL = "http://localhost:3001/graphql";

  beforeEach(() => {
    cy.task("db:seed");
    cy.viewport(1280, 720);

    cy.intercept("POST", apiGraphQL, (req) => {
      const { body } = req;
      if (body && body.operationName === "CreateBankAccount") {
        req.alias = "gqlCreateBankAccount";
      }
      if (body && body.operationName === "DeleteBankAccount") {
        req.alias = "gqlDeleteBankAccount";
      }
    });

    cy.login("Katharina_Bernier", "s3cret");
  });

  it("TC-BANK-001 (Caja Negra - Positivo): Registro exitoso de nueva cuenta bancaria con datos válidos", () => {
    cy.visit("/bankaccounts/new");
    cy.location("pathname").should("equal", "/bankaccounts/new");

    cy.getBySelLike("bankName-input").type("Chase Bank Central");
    cy.getBySelLike("routingNumber-input").type("123456789");
    cy.getBySelLike("accountNumber-input").type("987654321");
    cy.getBySel("bankaccount-submit").should("be.enabled").click();

    cy.wait("@gqlCreateBankAccount");
    cy.location("pathname").should("equal", "/bankaccounts");
    cy.getBySelLike("bankaccount-list-item").should("contain", "Chase Bank Central");

    cy.screenshot("evidencias/flujo-2-cuentas-bancarias/TC-BANK-001");
  });

  it("TC-BANK-002 (Caja Negra - BVA Min-1): Validación de valor límite inferior para Routing Number (8 dígitos)", () => {
    cy.visit("/bankaccounts/new");

    cy.getBySelLike("routingNumber-input").type("12345678");
    cy.getBySelLike("routingNumber-input").find("input").blur();

    cy.get("#bankaccount-routingNumber-input-helper-text")
      .should("be.visible")
      .and(($el) => {
        expect($el.text()).to.match(/Must contain (9 digits|a valid routing number)/i);
      });
    cy.getBySel("bankaccount-submit").should("be.disabled");

    cy.screenshot("evidencias/flujo-2-cuentas-bancarias/TC-BANK-002");
  });

  it("TC-BANK-003 (Caja Negra - Longitud Min-1): Validación de longitud mínima insuficiente en Nombre del Banco", () => {
    cy.visit("/bankaccounts/new");

    cy.getBySelLike("bankName-input").type("AB");
    cy.getBySelLike("bankName-input").find("input").blur();

    cy.get("#bankaccount-bankName-input-helper-text")
      .should("be.visible")
      .and("contain", "Must contain at least 5 characters");
    cy.getBySel("bankaccount-submit").should("be.disabled");

    cy.screenshot("evidencias/flujo-2-cuentas-bancarias/TC-BANK-003");
  });

  it("TC-BANK-CB-001 (Caja Blanca - Rama True routingNumber.length === 9): Cumplimiento de longitud exacta de 9 dígitos", () => {
    cy.visit("/bankaccounts/new");

    cy.getBySelLike("routingNumber-input").type("123456789");
    cy.getBySelLike("routingNumber-input").find("input").blur();

    // El esquema Yup no genera mensaje de error para este campo
    cy.get("#bankaccount-routingNumber-input-helper-text").should("not.exist");

    cy.screenshot("evidencias/flujo-2-cuentas-bancarias/TC-BANK-CB-001");
  });

  it("TC-BANK-CB-002 (Caja Blanca - Rama False routingNumber.length !== 9): Excepción de validación al exceder 9 dígitos (10 dígitos)", () => {
    cy.visit("/bankaccounts/new");

    cy.getBySelLike("routingNumber-input").type("1234567890");
    cy.getBySelLike("routingNumber-input").find("input").blur();

    // Yup length(9) evalúa a falso y lanza la excepción de validación
    cy.get("#bankaccount-routingNumber-input-helper-text")
      .should("be.visible")
      .and(($el) => {
        expect($el.text()).to.match(/Must contain (9 digits|a valid routing number)/i);
      });
    cy.getBySel("bankaccount-submit").should("be.disabled");

    cy.screenshot("evidencias/flujo-2-cuentas-bancarias/TC-BANK-CB-002");
  });

  it("TC-EXP-BANK-001 (Experiencia - Entrada No Numérica): Tratamiento de caracteres especiales y alfanuméricos en routing number", () => {
    cy.visit("/bankaccounts/new");

    cy.getBySelLike("routingNumber-input").type("123-abc!*#");
    cy.getBySelLike("routingNumber-input").find("input").blur();

    // Verifica que el sistema no lo acepta como válido y bloquea el envío
    cy.get("#bankaccount-routingNumber-input-helper-text")
      .should("be.visible")
      .and(($el) => {
        expect($el.text()).to.match(/Must contain (9 digits|a valid routing number)/i);
      });
    cy.getBySel("bankaccount-submit").should("be.disabled");

    cy.screenshot("evidencias/flujo-2-cuentas-bancarias/TC-EXP-BANK-001");
  });

  it("TC-EXP-BANK-002 (Experiencia - Borrado de cuenta): Integridad del historial de transacciones tras borrado lógico de cuenta", () => {
    cy.visit("/bankaccounts");
    cy.getBySelLike("bankaccount-list-item").should("exist");

    // Eliminar cuenta bancaria
    cy.getBySelLike("delete").first().click();
    cy.wait("@gqlDeleteBankAccount");
    cy.getBySelLike("bankaccount-list-item").first().should("contain", "Deleted");

    // Navegar al feed principal para verificar que la vista y el historial no colapsan
    cy.visit("/");
    cy.getBySel("transaction-list").should("be.visible");
    cy.getBySel("nav-personal-tab").click();
    cy.getBySel("transaction-list").should("be.visible");

    cy.screenshot("evidencias/flujo-2-cuentas-bancarias/TC-EXP-BANK-002");
  });
});
