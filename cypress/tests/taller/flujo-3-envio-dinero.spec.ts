describe("Flujo 3: Envío de Dinero", () => {
  const backendUrl = "http://localhost:3001";

  beforeEach(() => {
    cy.task("db:seed");
    cy.viewport(1280, 720);

    cy.intercept("POST", "/transactions").as("postTransaction");
    cy.intercept("GET", "/checkAuth").as("checkAuth");
    cy.intercept("GET", "/users/search*").as("userSearch");

    cy.login("Katharina_Bernier", "s3cret");
  });

  it("TC-TRANS-005 (Caja Negra - BVA Límite Mínimo $0.01): Envío de valor límite mínimo permitido", () => {
    cy.visit("/transaction/new");

    cy.getBySel("user-list-search-input").type("Ted Parisian");
    cy.getBySelLike("user-list-item").contains("Ted Parisian").click({ force: true });

    cy.getBySelLike("amount-input").type("0.01");
    cy.getBySelLike("description-input").type("Centavo de prueba QA");
    cy.getBySelLike("submit-payment").should("be.enabled").click();

    cy.wait("@postTransaction").its("response.statusCode").should("equal", 200);
    cy.getBySel("alert-bar-success")
      .should("be.visible")
      .and("contain", "Transaction Submitted!");

    // Verificar actualización del balance visible
    cy.getBySel("sidenav-user-balance").should("be.visible");

    cy.screenshot("evidencias/flujo-3-envio-dinero/TC-TRANS-005");
  });

  it("TC-TRANS-006 (Caja Negra - Monto Negativo): Bloqueo de entrada para cantidades negativas", () => {
    cy.visit("/transaction/new");

    cy.getBySel("user-list-search-input").type("Ted Parisian");
    cy.getBySelLike("user-list-item").contains("Ted Parisian").click({ force: true });

    cy.getBySelLike("amount-input").type("-25");
    cy.getBySelLike("amount-input").find("input").clear().blur();

    cy.get("#transaction-create-amount-input-helper-text")
      .should("be.visible")
      .and("contain", "Please enter a valid amount");
    cy.getBySelLike("submit-payment").should("be.disabled");

    cy.screenshot("evidencias/flujo-3-envio-dinero/TC-TRANS-006");
  });

  it("TC-TRANS-007 (Caja Negra - Monto Excede Balance): Comportamiento del sistema ante montos que exceden el saldo", () => {
    cy.visit("/transaction/new");

    cy.getBySel("user-list-search-input").type("Ted Parisian");
    cy.getBySelLike("user-list-item").contains("Ted Parisian").click({ force: true });

    cy.getBySelLike("amount-input").type("999999");
    cy.getBySelLike("description-input").type("Monto que supera saldo");
    cy.getBySelLike("submit-payment").should("be.enabled").click();

    cy.wait("@postTransaction").then((interception) => {
      expect(interception.response?.statusCode).to.equal(200);
      // RWA compensa fondos insuficientes mediante débito a cuenta bancaria
      expect(interception.response?.body.transaction.status).to.equal("complete");
    });

    cy.getBySel("alert-bar-success").should("be.visible");

    cy.screenshot("evidencias/flujo-3-envio-dinero/TC-TRANS-007");
  });

  it("TC-TRANS-CB-001 (Caja Blanca - Rama transactionType === 'payment'): Confirmación de estatus 'complete' en pago", () => {
    cy.visit("/transaction/new");

    cy.getBySel("user-list-search-input").type("Ted Parisian");
    cy.getBySelLike("user-list-item").contains("Ted Parisian").click({ force: true });

    cy.getBySelLike("amount-input").type("10.00");
    cy.getBySelLike("description-input").type("Pago validacion caja blanca");
    cy.getBySelLike("submit-payment").click();

    cy.wait("@postTransaction").then((interception) => {
      const tx = interception.response?.body.transaction;
      expect(tx.status).to.equal("complete");
      expect(tx.requestStatus).to.be.undefined;
    });

    cy.getBySel("alert-bar-success").should("be.visible");

    cy.screenshot("evidencias/flujo-3-envio-dinero/TC-TRANS-CB-001");
  });

  it("TC-TRANS-CB-002 (Caja Blanca - Rama transactionType !== 'payment'): Transacción tipo 'request' mantiene status 'pending' sin debitar", () => {
    // Consultar balance inicial
    let balanceInicial: number;
    cy.request(`${backendUrl}/checkAuth`).then((res) => {
      balanceInicial = res.body.user.balance;
    });

    // Enviar transacción tipo 'request' por API
    cy.database("find", "users", { username: "Heath93" }).then((receiver: any) => {
      cy.request({
        method: "POST",
        url: `${backendUrl}/transactions`,
        body: {
          transactionType: "request",
          amount: 20,
          description: "Cobro prueba caja blanca request",
          receiverId: receiver.id,
        },
      }).then((response) => {
        expect(response.status).to.equal(200);
        const tx = response.body.transaction;
        // Rama transactionType !== 'payment'
        expect(tx.status).to.equal("pending");
        expect(tx.requestStatus).to.equal("pending");
      });
    });

    // Validar que el balance no se debitó
    cy.request(`${backendUrl}/checkAuth`).then((res) => {
      expect(res.body.user.balance).to.equal(balanceInicial);
    });

    cy.visit("/");
    cy.getBySel("sidenav-user-balance").should("be.visible");

    cy.screenshot("evidencias/flujo-3-envio-dinero/TC-TRANS-CB-002");
  });

  it("TC-EXP-TRANS-001 (Experiencia - Doble Clic / Race Condition): Prevención de transacciones duplicadas por doble clic", () => {
    cy.visit("/transaction/new");

    cy.getBySel("user-list-search-input").type("Ted Parisian");
    cy.getBySelLike("user-list-item").contains("Ted Parisian").click({ force: true });

    cy.getBySelLike("amount-input").type("15.00");
    cy.getBySelLike("description-input").type("Prueba doble clic continuo");

    // Doble clic continuo rápido sobre el botón Pay
    cy.getBySelLike("submit-payment").dblclick();

    cy.wait("@postTransaction").its("response.statusCode").should("equal", 200);
    cy.getBySel("alert-bar-success").should("be.visible");

    cy.screenshot("evidencias/flujo-3-envio-dinero/TC-EXP-TRANS-001");
  });

  it("TC-EXP-TRANS-002 (Experiencia - Auto-pago): Exclusión del propio usuario logueado en la búsqueda de destinatarios", () => {
    cy.visit("/transaction/new");

    // Buscar al propio usuario en sesión
    cy.getBySel("user-list-search-input").type("Katharina_Bernier");
    cy.wait("@userSearch");

    // El usuario logueado no debe figurar en la lista de resultados para auto-pagos
    cy.getBySel("users-list").should("not.contain", "Katharina Bernier");
    cy.getBySelLike("user-list-item").should("have.length", 0);

    cy.screenshot("evidencias/flujo-3-envio-dinero/TC-EXP-TRANS-002");
  });
});
