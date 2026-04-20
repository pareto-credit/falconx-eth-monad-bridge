const { expect } = require('chai');
const { ethers } = require('hardhat');

const ETHEREUM_EID = 30101;
const MONAD_EID = 30390;

function toBytes32(address) {
    return ethers.utils.hexZeroPad(address, 32);
}

async function expectRevert(txPromise, expectedFragment) {
    try {
        await txPromise;
        expect.fail(`Expected revert containing "${expectedFragment}"`);
    } catch (error) {
        expect(error.message).to.include(expectedFragment);
    }
}

describe('Bridge pause controls', function () {
    async function deployFixture() {
        const [owner, stranger] = await ethers.getSigners();

        const endpointFactory = await ethers.getContractFactory('MockEndpointV2');
        const endpoint = await endpointFactory.deploy();
        await endpoint.deployed();

        const tokenFactory = await ethers.getContractFactory('TestERC20');
        const token = await tokenFactory.deploy('Test Token', 'TEST');
        await token.deployed();
        await token.mint(owner.address, ethers.utils.parseEther('1000'));

        const adapterFactory = await ethers.getContractFactory('FalconXAAAdapter');
        const adapter = await adapterFactory.deploy(token.address, endpoint.address, owner.address);
        await adapter.deployed();

        const monadFactory = await ethers.getContractFactory('MonadFalconXAA');
        const monad = await monadFactory.deploy('Monad Test Token', 'mTEST', endpoint.address, owner.address);
        await monad.deployed();

        await adapter.setPeer(MONAD_EID, toBytes32(monad.address));
        await monad.setPeer(ETHEREUM_EID, toBytes32(adapter.address));

        return { owner, stranger, endpoint, token, adapter, monad };
    }

    it('lets only the owner pause and unpause the adapter', async function () {
        const { owner, stranger, adapter } = await deployFixture();

        await expectRevert(adapter.connect(stranger).pause(), 'OwnableUnauthorizedAccount');

        await adapter.connect(owner).pause();
        expect(await adapter.paused()).to.equal(true);

        await adapter.connect(owner).unpause();
        expect(await adapter.paused()).to.equal(false);
    });

    it('blocks adapter sends while paused', async function () {
        const { owner, adapter } = await deployFixture();

        await adapter.pause();

        const sendParam = {
            dstEid: MONAD_EID,
            to: toBytes32(owner.address),
            amountLD: ethers.utils.parseEther('1'),
            minAmountLD: ethers.utils.parseEther('1'),
            extraOptions: '0x',
            composeMsg: '0x',
            oftCmd: '0x',
        };
        const fee = {
            nativeFee: 0,
            lzTokenFee: 0,
        };

        await expectRevert(adapter.send(sendParam, fee, owner.address), 'EnforcedPause');
    });

    it('blocks monad receives while paused', async function () {
        const { owner, endpoint, adapter, monad } = await deployFixture();

        await monad.pause();

        const origin = {
            srcEid: ETHEREUM_EID,
            sender: toBytes32(adapter.address),
            nonce: 1,
        };

        await expectRevert(
            endpoint.callLzReceive(monad.address, origin, ethers.constants.HashZero, '0x', owner.address, '0x'),
            'EnforcedPause'
        );
    });

    it('blocks ethereum adapter receives while paused', async function () {
        const { owner, endpoint, adapter, monad } = await deployFixture();

        await adapter.pause();

        const origin = {
            srcEid: MONAD_EID,
            sender: toBytes32(monad.address),
            nonce: 1,
        };

        await expectRevert(
            endpoint.callLzReceive(adapter.address, origin, ethers.constants.HashZero, '0x', owner.address, '0x'),
            'EnforcedPause'
        );
    });
});
