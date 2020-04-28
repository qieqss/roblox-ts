import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import ts from "typescript";
import { assert } from "Shared/util/assert";
import { getOrDefault } from "Shared/util/getOrDefault";

export function transformIdentifierDefined(state: TransformState, node: ts.Identifier) {
	return lua.create(lua.SyntaxKind.Identifier, {
		name: node.text,
	});
}

function getAncestorWhichIsChildOf(parent: ts.Node, node: ts.Node) {
	while (node.parent && node.parent !== parent) {
		node = node.parent;
	}
	return node.parent ? node : undefined;
}

function isBlockLike(node: ts.Node): node is ts.BlockLike {
	return (
		node.kind === ts.SyntaxKind.SourceFile ||
		node.kind === ts.SyntaxKind.Block ||
		node.kind === ts.SyntaxKind.ModuleBlock ||
		node.kind === ts.SyntaxKind.CaseClause ||
		node.kind === ts.SyntaxKind.DefaultClause
	);
}

function getDeclarationStatement(node: ts.Node): ts.Statement | undefined {
	while (node && !ts.isStatement(node)) {
		node = node.parent;
	}
	return node;
}

function checkHoist(state: TransformState, node: ts.Identifier, symbol: ts.Symbol) {
	if (state.isHoisted.get(symbol) !== undefined) {
		return;
	}

	const declarationStatement = getDeclarationStatement(symbol.valueDeclaration);
	if (!declarationStatement) {
		return;
	}

	const parent = declarationStatement.parent;
	if (!parent || !isBlockLike(parent)) {
		return;
	}

	const sibling = getAncestorWhichIsChildOf(parent, node);
	if (!sibling || !ts.isStatement(sibling)) {
		return;
	}

	const declarationIdx = parent.statements.indexOf(declarationStatement);
	const siblingIdx = parent.statements.indexOf(sibling);

	if (siblingIdx > declarationIdx) {
		return;
	}

	if (siblingIdx === declarationIdx) {
		// function declarations can self refer
		if (ts.isFunctionDeclaration(declarationStatement)) {
			return;
		}
	}

	getOrDefault(state.hoistsByStatement, sibling, () => new Array<ts.Identifier>()).push(node);
	state.isHoisted.set(symbol, true);

	return;
}

export function transformIdentifier(state: TransformState, node: ts.Identifier) {
	const symbol = state.typeChecker.getSymbolAtLocation(node);
	assert(symbol);
	if (state.typeChecker.isUndefinedSymbol(symbol)) {
		return lua.nil();
	}

	const macro = state.macroManager.getIdentifierMacro(symbol);
	if (macro) {
		return macro(state, node);
	}

	checkHoist(state, node, symbol);

	return transformIdentifierDefined(state, node);
}
