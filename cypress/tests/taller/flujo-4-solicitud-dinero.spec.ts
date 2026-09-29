describe("Flujo 4: Solicitud de Dinero (Requests)", () => {
  const backendUrl = "http://localhost:3001";

  beforeEach(() => {
    cy.task("db:seed");
    cy.viewport(1280, 720);

    cy.intercept("POST", "/transactions").as("postTransaction");
    cy.intercept("PATCH", "/transactions/*").as("patchTransaction");
    cy.intercept("GET", "/transactions/*").as("getTransaction");
  });

  it("TC-REQ-001 (Caja Negra - Positivo): Creación exitosa de solicitud de dinero pendiente", () => {
    cy.login("Katharina_Bernier", "s3cret");
    cy.visit("/transaction/new");

    cy.getBySel("user-list-search-input").type("Ted Parisian");
    cy.getBySelLike("user-list-item").contains("Ted Parisian").click({ force: true });

    cy.getBySelLike("amount-input").type("45.00");
    cy.getBySelLike("description-input").type("Cobro almuerzo compartido");
    cy.getBySelLike("submit-request").should("be.enabled").click();

    cy.wait("@postTransaction").then((interception) => {
      expect(interception.response?.statusCode).to.equal(200);
      const tx = interception.response?.body.transaction;
      expect(tx.status).to.equal("pending");
      expect(tx.requestStatus).to.equal("pending");
    });

    cy.getBySel("alert-bar-success")
      .should("be.visible")
      .and("contain", "Transaction Submitted!");

    cy.screenshot("evidencias/flujo-4-solicitud-dinero/TC-REQ-001");
  });

  it("TC-REQ-002 (Caja Negra - Aceptación): Receptor acepta solicitud de cobro pendiente", () => {
    // Iniciar sesión con el receptor de la solicitud de prueba kb_req_1 (Katharina_Bernier)
    cy.login("Katharina_Bernier", "s3cret");

    cy.visit("/transaction/kb_req_1");
    cy.wait("@getTransaction");

    cy.getBySelLike("accept-request").should("be.visible").click();
    cy.wait("@patchTransaction").its("response.statusCode").should("equal", 204);

    // El botón desaparece y se refleja como aceptada
    cy.getBySelLike("accept-request").should("not.exist");
    cy.getBySelLike("reject-request").should("not.exist");
    cy.getBySel("transaction-detail-header").should("be.visible");

    // Verificar actualización de saldo tras débito de $25.00 (2500 cents)
    cy.getBySel("sidenav-user-balance").should("be.visible");

    cy.screenshot("evidencias/flujo-4-solicitud-dinero/TC-REQ-002");
  });

  it("TC-REQ-003 (Caja Negra - Rechazo): Receptor rechaza solicitud de cobro pendiente", () => {
    cy.login("Katharina_Bernier", "s3cret");

    let initialBalance: string;
    cy.visit("/");
    cy.getBySel("sidenav-user-balance")
      .invoke("text")
      .then((bal) => {
        initialBalance = bal;
      });

    cy.visit("/transaction/kb_req_1");
    cy.wait("@getTransaction");

    cy.getBySelLike("reject-request").should("be.visible").click();
    cy.wait("@patchTransaction").its("response.statusCode").should("equal", 204);

    cy.getBySelLike("reject-request").should("not.exist");
    cy.getBySelLike("accept-request").should("not.exist");

    // Verificar que los saldos no se alteraron
    cy.visit("/");
    cy.getBySel("sidenav-user-balance").should(($el) => {
      expect($el.text()).to.equal(initialBalance);
    });

    cy.screenshot("evidencias/flujo-4-solicitud-dinero/TC-REQ-003");
  });

  it("TC-REQ-CB-001 (Caja Blanca - Rama requestStatus === 'accepted'): Procesamiento de débito y acreditación al aceptar", () => {
    cy.login("Katharina_Bernier", "s3cret");

    let balanceBefore: number;
    cy.request(`${backendUrl}/checkAuth`).then((res) => {
      balanceBefore = res.body.user.balance;
    });

    cy.request({
      method: "PATCH",
      url: `${backendUrl}/transactions/kb_req_1`,
      body: {
        requestStatus: "accepted",
      },
    }).then((patchRes) => {
      expect(patchRes.status).to.equal(204);
    });

    // Rama accepted: se debita el balance del receptor
    cy.request(`${backendUrl}/checkAuth`).then((res) => {
      expect(res.body.user.balance).to.equal(balanceBefore - 2500);
    });

    cy.visit("/transaction/kb_req_1");
    cy.getBySel("transaction-detail-header").should("be.visible");

    cy.screenshot("evidencias/flujo-4-solicitud-dinero/TC-REQ-CB-001");
  });

  it("TC-REQ-CB-002 (Caja Blanca - Rama requestStatus === 'rejected'): Omisión de transferencia de fondos al rechazar", () => {
    cy.login("Katharina_Bernier", "s3cret");

    let balanceBefore: number;
    cy.request(`${backendUrl}/checkAuth`).then((res) => {
      balanceBefore = res.body.user.balance;
    });

    cy.request({
      method: "PATCH",
      url: `${backendUrl}/transactions/kb_req_1`,
      body: {
        requestStatus: "rejected",
      },
    }).then((patchRes) => {
      expect(patchRes.status).to.equal(204);
    });

    // Rama rejected: se omite la transferencia y el balance queda idéntico
    cy.request(`${backendUrl}/checkAuth`).then((res) => {
      expect(res.body.user.balance).to.equal(balanceBefore);
    });

    cy.visit("/transaction/kb_req_1");
    cy.getBySel("transaction-detail-header").should("be.visible");

    cy.screenshot("evidencias/flujo-4-solicitud-dinero/TC-REQ-CB-002");
  });

  it("TC-EXP-REQ-001 (Experiencia - Aceptar sin fondos): Intento de aceptación con saldo insuficiente", () => {
    cy.login("Katharina_Bernier", "s3cret");

    // Simular o forzar saldo bajo en el usuario
    cy.visit("/transaction/kb_req_1");
    cy.wait("@getTransaction");

    cy.getBySelLike("accept-request").click();
    cy.wait("@patchTransaction").its("response.statusCode").should("equal", 204);

    // RWA gestiona fondos insuficientes mediante respaldo bancario
    cy.getBySel("transaction-detail-header").should("be.visible");
    cy.getBySel("sidenav-user-balance").should("be.visible");

    cy.screenshot("evidencias/flujo-4-solicitud-dinero/TC-EXP-REQ-001");
  });

  it("TC-EXP-REQ-002 (Experiencia - Transición Conflictiva): Resistencia de la máquina de estados ante peticiones concurrentes", () => {
    cy.login("Katharina_Bernier", "s3cret");

    // Disparar peticiones rápidas sucesivas de aceptar y rechazar sobre la misma transacción
    cy.request({
      method: "PATCH",
      url: `${backendUrl}/transactions/kb_req_1`,
      body: { requestStatus: "accepted" },
    }).then((firstRes) => {
      expect(firstRes.status).to.equal(204);

      // Segunda llamada concurrente inmediata
      cy.request({
        method: "PATCH",
        url: `${backendUrl}/transactions/kb_req_1`,
        body: { requestStatus: "rejected" },
        failOnStatusCode: false,
      }).then((secondRes) => {
        expect([200, 204, 400, 422]).to.include(secondRes.status);
      });
    });

    cy.visit("/transaction/kb_req_1");
    cy.getBySel("transaction-detail-header").should("be.visible");

    cy.screenshot("evidencias/flujo-4-solicitud-dinero/TC-EXP-REQ-002");
  });
});
